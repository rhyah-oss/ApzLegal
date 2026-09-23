import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { db, clientsTable, mattersTable, timeEntriesTable, usersTable } from "@workspace/db";
import { getCurrentUser } from "../lib/context";

const router: IRouter = Router();
const SELF_ONLY_ROLES = new Set(["candidate_attorney", "paralegal", "legal_secretary", "secretary"]);
const INSUFFICIENT_DATA = "Insufficient data to generate this insight.";

type ProductivityEntry = {
  id: number;
  matterId: number;
  reference: string;
  matterTitle: string;
  clientId: number;
  clientName: string;
  practiceArea: string | null;
  userId: number | null;
  userName: string | null;
  description: string;
  hours: number;
  entryDate: string | null;
  createdAt: Date;
};

function johannesburgDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDefaultRange(): { startDate: string; endDate: string } {
  const today = johannesburgDateString(new Date());
  return {
    startDate: `${today.slice(0, 7)}-01`,
    endDate: today,
  };
}

function parseDateRange(query: Record<string, unknown>): { startDate: string; endDate: string } | null {
  const defaults = getDefaultRange();
  const startDate = typeof query.startDate === "string" && query.startDate ? query.startDate : defaults.startDate;
  const endDate = typeof query.endDate === "string" && query.endDate ? query.endDate : defaults.endDate;
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || startDate > endDate || Date.parse(endDate) - Date.parse(startDate) > 365 * 86_400_000) return null;
  return { startDate, endDate };
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function displayPeriod(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const format = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return startDate === endDate ? format.format(start) : `${format.format(start)} – ${format.format(end)}`;
}

function granularityFor(startDate: string, endDate: string): "day" | "week" | "month" {
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function bucketFor(dateString: string, granularity: "day" | "week" | "month"): string {
  if (granularity === "day") return dateString;
  const date = new Date(`${dateString}T00:00:00Z`);
  if (granularity === "month") return dateString.slice(0, 7);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function bucketLabel(bucket: string, granularity: "day" | "week" | "month"): string {
  const date = new Date(`${bucket}${granularity === "month" ? "-01" : ""}T00:00:00Z`);
  if (granularity === "month") return new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  if (granularity === "week") return `Week of ${new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" }).format(date)}`;
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function workingDays(startDate: string, endDate: string): number {
  let count = 0;
  for (let date = new Date(`${startDate}T00:00:00Z`); date <= new Date(`${endDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return Math.max(count, 1);
}

function entryDate(entry: ProductivityEntry): string {
  return entry.entryDate ?? johannesburgDateString(entry.createdAt);
}

function entryHour(entry: ProductivityEntry): number {
  return Number(new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  }).format(entry.createdAt));
}

async function loadEntries(
  startDate: string,
  endDate: string,
  currentUser: { id: number; role: string },
  filters: { userId?: number; matterId?: number; clientId?: number; practiceArea?: string },
): Promise<ProductivityEntry[]> {
  const conditions: SQL[] = [
    sql`coalesce(${timeEntriesTable.entryDate}, (${timeEntriesTable.createdAt} AT TIME ZONE 'Africa/Johannesburg')::date) >= ${startDate}`,
    sql`coalesce(${timeEntriesTable.entryDate}, (${timeEntriesTable.createdAt} AT TIME ZONE 'Africa/Johannesburg')::date) <= ${endDate}`,
  ];

  const selectedUserId = SELF_ONLY_ROLES.has(currentUser.role) ? currentUser.id : filters.userId;
  if (selectedUserId) conditions.push(eq(timeEntriesTable.userId, selectedUserId));
  if (filters.matterId) conditions.push(eq(timeEntriesTable.matterId, filters.matterId));
  if (filters.clientId) conditions.push(eq(mattersTable.clientId, filters.clientId));
  if (filters.practiceArea === "Unspecified") {
    conditions.push(or(sql`trim(coalesce(${mattersTable.practiceArea}, '')) = ''`)!);
  } else if (filters.practiceArea) {
    conditions.push(eq(mattersTable.practiceArea, filters.practiceArea));
  }

  const rows = await db
    .select({
      id: timeEntriesTable.id,
      matterId: timeEntriesTable.matterId,
      reference: mattersTable.reference,
      matterTitle: mattersTable.title,
      clientId: mattersTable.clientId,
      clientName: clientsTable.name,
      practiceArea: mattersTable.practiceArea,
      userId: timeEntriesTable.userId,
      userName: usersTable.name,
      description: timeEntriesTable.description,
      hours: timeEntriesTable.hours,
      entryDate: timeEntriesTable.entryDate,
      createdAt: timeEntriesTable.createdAt,
    })
    .from(timeEntriesTable)
    .innerJoin(mattersTable, eq(timeEntriesTable.matterId, mattersTable.id))
    .innerJoin(clientsTable, eq(mattersTable.clientId, clientsTable.id))
    .leftJoin(usersTable, eq(timeEntriesTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(asc(timeEntriesTable.createdAt));

  return rows.map((row) => ({
    ...row,
    hours: Number(row.hours),
  }));
}

function buildPreviousRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  const previousEnd = shiftDate(startDate, -1);
  return { startDate: shiftDate(previousEnd, -(days - 1)), endDate: previousEnd };
}

router.get("/productivity/summary", async (req, res): Promise<void> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    res.status(401).json({ error: "Not authenticated", code: "AUTH_REQUIRED" });
    return;
  }

  const range = parseDateRange(req.query as Record<string, unknown>);
  if (!range) {
    res.status(400).json({ error: "startDate and endDate must be valid dates, with startDate on or before endDate and no more than 366 days inclusive." });
    return;
  }

  const filters = {
    userId: optionalInteger(req.query.userId),
    matterId: optionalInteger(req.query.matterId),
    clientId: optionalInteger(req.query.clientId),
    practiceArea: typeof req.query.practiceArea === "string" && req.query.practiceArea ? req.query.practiceArea : undefined,
  };

  const previousRange = buildPreviousRange(range.startDate, range.endDate);
  const [entries, previousEntries] = await Promise.all([
    loadEntries(range.startDate, range.endDate, currentUser, filters),
    loadEntries(previousRange.startDate, previousRange.endDate, currentUser, filters),
  ]);
  const matterAccessConditions: SQL[] = [eq(mattersTable.status, "active")];
  if (SELF_ONLY_ROLES.has(currentUser.role)) matterAccessConditions.push(eq(mattersTable.assignedToId, currentUser.id));
  const eligibleMatterConditions: SQL[] = [...matterAccessConditions];
  if (filters.matterId) eligibleMatterConditions.push(eq(mattersTable.id, filters.matterId));
  if (filters.clientId) eligibleMatterConditions.push(eq(mattersTable.clientId, filters.clientId));
  if (filters.practiceArea === "Unspecified") {
    eligibleMatterConditions.push(or(sql`trim(coalesce(${mattersTable.practiceArea}, '')) = ''`)!);
  } else if (filters.practiceArea) {
    eligibleMatterConditions.push(eq(mattersTable.practiceArea, filters.practiceArea));
  }
  const eligibleMatters = await db
    .select({ matterId: mattersTable.id, reference: mattersTable.reference, title: mattersTable.title })
    .from(mattersTable)
    .where(and(...eligibleMatterConditions));
  const practiceAreaConditions: SQL[] = [...matterAccessConditions];
  if (filters.matterId) practiceAreaConditions.push(eq(mattersTable.id, filters.matterId));
  if (filters.clientId) practiceAreaConditions.push(eq(mattersTable.clientId, filters.clientId));
  const [filterOptionUsers, filterOptionMatters] = await Promise.all([
    SELF_ONLY_ROLES.has(currentUser.role)
      ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, currentUser.id))
      : db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).orderBy(asc(usersTable.name)),
    db.select({ practiceArea: mattersTable.practiceArea }).from(mattersTable).where(and(...practiceAreaConditions)),
  ]);

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const activeUserIds = new Set(entries.map((entry) => entry.userId).filter((id): id is number => id !== null));
  const activeMatterIds = new Set(entries.map((entry) => entry.matterId));
  const averageHoursPerUser = activeUserIds.size ? totalHours / activeUserIds.size : 0;
  const averageHoursPerDay = totalHours / workingDays(range.startDate, range.endDate);

  const byMatterMap = new Map<number, {
    matterId: number; reference: string; title: string; clientId: number; clientName: string; practiceArea: string | null;
    totalHours: number; activities: number; users: Set<number>; lastActivity: Date;
  }>();
  const byUserMap = new Map<number, { userId: number; userName: string; role: string | null; totalHours: number; activities: number; matters: Set<number> }>();
  const byPracticeMap = new Map<string, { practiceArea: string; totalHours: number; activities: number }>();
  const trendMap = new Map<string, { key: string; totalHours: number; activities: number; users: Set<number>; matters: Set<number> }>();

  for (const entry of entries) {
    const matter = byMatterMap.get(entry.matterId) ?? {
      matterId: entry.matterId, reference: entry.reference, title: entry.matterTitle, clientId: entry.clientId,
      clientName: entry.clientName, practiceArea: entry.practiceArea, totalHours: 0, activities: 0, users: new Set<number>(), lastActivity: entry.createdAt,
    };
    matter.totalHours += entry.hours;
    matter.activities += 1;
    if (entry.userId !== null) matter.users.add(entry.userId);
    if (entry.createdAt > matter.lastActivity) matter.lastActivity = entry.createdAt;
    byMatterMap.set(entry.matterId, matter);

    if (entry.userId !== null) {
      const user = byUserMap.get(entry.userId) ?? {
        userId: entry.userId, userName: entry.userName ?? "Unassigned user", role: null, totalHours: 0, activities: 0, matters: new Set<number>(),
      };
      user.totalHours += entry.hours;
      user.activities += 1;
      user.matters.add(entry.matterId);
      byUserMap.set(entry.userId, user);
    }

    const practiceArea = entry.practiceArea?.trim() || "Unspecified";
    const practice = byPracticeMap.get(practiceArea) ?? { practiceArea, totalHours: 0, activities: 0 };
    practice.totalHours += entry.hours;
    practice.activities += 1;
    byPracticeMap.set(practiceArea, practice);

    const date = entryDate(entry);
    const granularity = granularityFor(range.startDate, range.endDate);
    const key = bucketFor(date, granularity);
    const trend = trendMap.get(key) ?? { key, totalHours: 0, activities: 0, users: new Set<number>(), matters: new Set<number>() };
    trend.totalHours += entry.hours;
    trend.activities += 1;
    if (entry.userId !== null) trend.users.add(entry.userId);
    trend.matters.add(entry.matterId);
    trendMap.set(key, trend);
  }

  const granularity = granularityFor(range.startDate, range.endDate);
  const trend = Array.from(trendMap.values()).sort((a, b) => a.key.localeCompare(b.key)).map((item) => ({
    period: item.key,
    label: bucketLabel(item.key, granularity),
    totalHours: round(item.totalHours),
    activities: item.activities,
    activeUsers: item.users.size,
    activeMatters: item.matters.size,
    tasksWorkedOn: null,
    tasksCompleted: null,
  }));

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayMap = dayNames.map((day) => ({ day, totalHours: 0, activities: 0 }));
  const hourMap = Array.from({ length: 24 }, (_, hour) => ({ hour, totalHours: 0, activities: 0 }));
  let morningHours = 0;
  let afternoonHours = 0;
  let afterHours = 0;
  for (const entry of entries) {
    const date = new Date(`${entryDate(entry)}T00:00:00Z`);
    const weekday = weekdayMap[date.getUTCDay()];
    weekday.totalHours += entry.hours;
    weekday.activities += 1;
    const hour = entryHour(entry);
    hourMap[hour].totalHours += entry.hours;
    hourMap[hour].activities += 1;
    if (hour >= 6 && hour < 12) morningHours += entry.hours;
    else if (hour >= 12 && hour < 18) afternoonHours += entry.hours;
    else afterHours += entry.hours;
  }

  const previousHours = previousEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const insights: string[] = [];
  if (!entries.length) {
    insights.push(INSUFFICIENT_DATA);
  } else {
    const topPractice = Array.from(byPracticeMap.values()).sort((a, b) => b.totalHours - a.totalHours)[0];
    if (topPractice && totalHours > 0) {
      insights.push(`${topPractice.practiceArea} represents ${round((topPractice.totalHours / totalHours) * 100, 1)}% of recorded time in this period.`);
    }
    if (previousHours > 0) {
      const change = ((totalHours - previousHours) / previousHours) * 100;
      insights.push(`Recorded activity ${change >= 0 ? "increased" : "decreased"} ${round(Math.abs(change), 1)}% compared with the previous period.`);
    } else {
      insights.push(INSUFFICIENT_DATA);
    }
    const topMattersHours = Array.from(byMatterMap.values()).sort((a, b) => b.totalHours - a.totalHours).slice(0, 3).reduce((sum, matter) => sum + matter.totalHours, 0);
    if (totalHours > 0 && byMatterMap.size > 1 && topMattersHours / totalHours >= 0.5) {
      insights.push(`${Math.min(3, byMatterMap.size)} matters account for ${round((topMattersHours / totalHours) * 100, 1)}% of recorded matter activity.`);
    }
  }

  const health = {
    totalEntries: entries.length,
    incompleteEntries: entries.filter((entry) => !entry.entryDate || entry.hours <= 0 || entry.userId === null).length,
    missingMatter: entries.filter((entry) => !entry.matterId).length,
    missingDate: entries.filter((entry) => !entry.entryDate).length,
    missingDescription: entries.filter((entry) => !entry.description?.trim()).length,
    incompleteDuration: entries.filter((entry) => entry.hours <= 0).length,
    uncategorizedEntries: null,
    lateManualEntries: null,
  };

  res.json({
    period: {
      startDate: range.startDate,
      endDate: range.endDate,
      label: displayPeriod(range.startDate, range.endDate),
      granularity,
    },
    filters: {
      userId: SELF_ONLY_ROLES.has(currentUser.role) ? currentUser.id : filters.userId ?? null,
      matterId: filters.matterId ?? null,
      clientId: filters.clientId ?? null,
      practiceArea: filters.practiceArea ?? null,
    },
    permissions: { scope: SELF_ONLY_ROLES.has(currentUser.role) ? "self" : "firm" },
    supportedDimensions: { activityType: false, team: false, department: false, taskMetrics: false },
    kpis: {
      totalHours: round(totalHours),
      activitiesLogged: entries.length,
      activeUsers: activeUserIds.size,
      activeMatters: activeMatterIds.size,
      averageHoursPerUser: round(averageHoursPerUser),
      averageHoursPerDay: round(averageHoursPerDay),
      tasksWorkedOn: null,
      tasksCompleted: null,
    },
    practiceAreas: Array.from(byPracticeMap.values()).sort((a, b) => b.totalHours - a.totalHours).map((item) => ({
      ...item, totalHours: round(item.totalHours), percentage: totalHours ? round((item.totalHours / totalHours) * 100, 1) : 0,
    })),
    matters: Array.from(byMatterMap.values()).sort((a, b) => b.totalHours - a.totalHours).map((item) => ({
      matterId: item.matterId, reference: item.reference, title: item.title, clientId: item.clientId, clientName: item.clientName,
      practiceArea: item.practiceArea, totalHours: round(item.totalHours), activities: item.activities, activeUsers: item.users.size,
      lastActivity: item.lastActivity, tasksWorkedOn: null,
    })),
    users: Array.from(byUserMap.values()).sort((a, b) => b.totalHours - a.totalHours).map((item) => ({
      userId: item.userId, userName: item.userName, totalHours: round(item.totalHours), activities: item.activities,
      mattersWorkedOn: item.matters.size, tasksWorkedOn: null, averageHoursPerDay: round(item.totalHours / workingDays(range.startDate, range.endDate)),
    })),
    trend,
    workPatterns: {
      byWeekday: weekdayMap.map((item) => ({ ...item, totalHours: round(item.totalHours) })),
      byHour: hourMap.map((item) => ({ ...item, totalHours: round(item.totalHours) })),
      morningHours: round(morningHours),
      afternoonHours: round(afternoonHours),
      afterHours: round(afterHours),
    },
    workload: {
      highActivityMatters: Array.from(byMatterMap.values()).sort((a, b) => b.totalHours - a.totalHours).slice(0, 3).map((item) => ({ matterId: item.matterId, reference: item.reference, title: item.title, totalHours: round(item.totalHours) })),
      lowActivityMatters: Array.from(byMatterMap.values()).sort((a, b) => a.totalHours - b.totalHours).slice(0, 3).map((item) => ({ matterId: item.matterId, reference: item.reference, title: item.title, totalHours: round(item.totalHours) })),
      inactiveMatters: eligibleMatters.filter((item) => !activeMatterIds.has(item.matterId)).slice(0, 3).map((item) => ({ ...item, totalHours: 0 })),
      concentratedMatters: Array.from(byMatterMap.values()).filter((item) => item.users.size > 0 && item.users.size <= 2).sort((a, b) => b.totalHours - a.totalHours).slice(0, 3).map((item) => ({ matterId: item.matterId, reference: item.reference, title: item.title, totalHours: round(item.totalHours), activeUsers: item.users.size })),
    },
    insights,
    health,
    filterOptions: {
      users: filterOptionUsers,
      practiceAreas: Array.from(new Set(filterOptionMatters.map((item) => item.practiceArea?.trim() || "Unspecified"))).sort(),
    },
  });
});

export default router;