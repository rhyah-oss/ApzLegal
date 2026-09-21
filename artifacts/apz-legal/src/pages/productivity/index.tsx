import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { format } from "date-fns";
import {
  AlertCircle,
  Briefcase,
  Clock,
  Download,
  Filter,
  TrendingUp,
  Users,
  X,
  ExternalLink,
  FileText
} from "lucide-react";
import {
  useGetProductivitySummary,
  useListMatters,
  useListClients
} from "@workspace/api-client-react";
import { PageLoader } from "@/components/ui/loader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { T, cardStyle } from "@/lib/theme";
import { DATE_PRESETS, formatDateRange } from "@/lib/date-presets";

export default function ProductivityPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const startDate = params.get("startDate") || undefined;
  const endDate = params.get("endDate") || undefined;
  const userId = params.get("userId") ? Number(params.get("userId")) : undefined;
  const matterId = params.get("matterId") ? Number(params.get("matterId")) : undefined;
  const clientId = params.get("clientId") ? Number(params.get("clientId")) : undefined;
  const practiceArea = params.get("practiceArea") || undefined;

  const [draftFilters, setDraftFilters] = useState({
    startDate, endDate, userId, matterId, clientId, practiceArea, preset: ""
  });
  const [userSort, setUserSort] = useState<"hours" | "activities" | "matters" | "average">("hours");
  const [matterSort, setMatterSort] = useState<"hours" | "activities" | "users" | "recent">("hours");
  const [trendMetric, setTrendMetric] = useState<"totalHours" | "activities" | "activeUsers" | "activeMatters">("totalHours");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

  useEffect(() => {
    setDraftFilters({ startDate, endDate, userId, matterId, clientId, practiceArea, preset: "" });
  }, [search]);

  const { data: matters } = useListMatters();
  const { data: clients } = useListClients();

  const queryParams = { startDate, endDate, userId, matterId, clientId, practiceArea };
  const { data: summary, isLoading, isError } = useGetProductivitySummary(queryParams, {
    query: {
      queryKey: ["productivitySummary", startDate, endDate, userId, matterId, clientId, practiceArea]
    }
  });

  const applyFilters = () => {
    if (draftFilters.startDate && draftFilters.endDate && draftFilters.startDate > draftFilters.endDate) {
      setFilterError("Start date must be on or before the end date.");
      return;
    }
    setFilterError(null);
    const p = new URLSearchParams();
    if (draftFilters.startDate) p.set("startDate", draftFilters.startDate);
    if (draftFilters.endDate) p.set("endDate", draftFilters.endDate);
    if (draftFilters.userId) p.set("userId", String(draftFilters.userId));
    if (draftFilters.matterId) p.set("matterId", String(draftFilters.matterId));
    if (draftFilters.clientId) p.set("clientId", String(draftFilters.clientId));
    if (draftFilters.practiceArea) p.set("practiceArea", draftFilters.practiceArea);
    setLocation(`/productivity?${p.toString()}`);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setFilterError(null);
    setFilterOpen(false);
    setLocation(`/productivity`);
  };

  const handleExport = () => {
    if (!summary) return;
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [
      "APZ Legal Firm Productivity Report",
      `Selected period,${csvCell(summary.period.label)}`,
      "",
      "Metric,Value",
      `Total recorded hours,${summary.kpis.totalHours}`,
      `Activities logged,${summary.kpis.activitiesLogged}`,
      `Active users,${summary.kpis.activeUsers}`,
      `Active matters,${summary.kpis.activeMatters}`,
      `Average hours per user,${summary.kpis.averageHoursPerUser}`,
      `Average hours per working day,${summary.kpis.averageHoursPerDay}`,
      "",
      "Employee,Recorded hours,Activities,Matters worked on,Average hours per day",
      ...summary.users.map(user => [
        csvCell(user.userName), user.totalHours, user.activities, user.mattersWorkedOn, user.averageHoursPerDay,
      ].join(",")),
      "",
      "Matter reference,Matter,Client,Practice area,Recorded hours,Activities,Active users,Last activity",
      ...summary.matters.map(matter => [
        csvCell(matter.reference), csvCell(matter.title), csvCell(matter.clientName),
        csvCell(matter.practiceArea ?? "Unspecified"), matter.totalHours, matter.activities,
        matter.activeUsers, csvCell(new Date(matter.lastActivity).toISOString()),
      ].join(",")),
      "",
      "Practice area,Recorded hours,Activities,Share of recorded time",
      ...summary.practiceAreas.map(area => [
        csvCell(area.practiceArea), area.totalHours, area.activities, `${area.percentage}%`,
      ].join(",")),
    ];

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `productivity_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const sortedUsers = useMemo(() => [...(summary?.users ?? [])].sort((a, b) => {
    if (userSort === "activities") return b.activities - a.activities;
    if (userSort === "matters") return b.mattersWorkedOn - a.mattersWorkedOn;
    if (userSort === "average") return b.averageHoursPerDay - a.averageHoursPerDay;
    return b.totalHours - a.totalHours;
  }), [summary?.users, userSort]);
  const sortedMatters = useMemo(() => [...(summary?.matters ?? [])].sort((a, b) => {
    if (matterSort === "activities") return b.activities - a.activities;
    if (matterSort === "users") return b.activeUsers - a.activeUsers;
    if (matterSort === "recent") return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    return b.totalHours - a.totalHours;
  }), [summary?.matters, matterSort]);

  if (isLoading) return <PageLoader />;
  if (isError) return <div className="p-6 text-[var(--apz-risk)]" data-testid="error-productivity-summary">Failed to load productivity data.</div>;

  const hasActiveFilters = !!(startDate || endDate || userId || matterId || clientId || practiceArea);
  const kpis = summary?.kpis;
  const patterns = summary?.workPatterns;

  let busiestDay = "--";
  let peakTime = "--";
  if (patterns?.byWeekday && patterns.byWeekday.length > 0) {
    const maxDay = patterns.byWeekday.reduce((a, b) => a.totalHours > b.totalHours ? a : b);
    if (maxDay.totalHours > 0) busiestDay = maxDay.day;
  }
  if (patterns?.byHour && patterns.byHour.length > 0) {
    const maxHour = patterns.byHour.reduce((a, b) => a.totalHours > b.totalHours ? a : b);
    if (maxHour.totalHours > 0) peakTime = `${String(maxHour.hour).padStart(2, '0')}:00`;
  }

  const fieldSx: React.CSSProperties = {
    background: T.surfaceEl,
    border: `1px solid ${T.border}`,
    borderRadius: 7,
    color: T.text,
    height: 36,
    fontSize: 12,
    padding: "0 12px",
    outline: "none",
    width: "100%",
  };

  const buildTimeLink = (paramsObj: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(search);
    Object.entries(paramsObj).forEach(([k, v]) => {
      if (v !== undefined) p.set(k, String(v));
    });
    return `/time?${p.toString()}`;
  };
  const trendMetricLabels = {
    totalHours: "Hours",
    activities: "Activities",
    activeUsers: "Active Users",
    activeMatters: "Active Matters",
  } as const;
  const trendPointLink = (period: string) => {
    if (!summary) return buildTimeLink({});
    const start = summary.period.granularity === "month" ? `${period}-01` : period;
    const bucketEnd = new Date(`${start}T00:00:00Z`);
    if (summary.period.granularity === "week") bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 6);
    if (summary.period.granularity === "month") bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 1, 0);
    const end = bucketEnd.toISOString().slice(0, 10);
    return buildTimeLink({
      startDate: start < summary.period.startDate ? summary.period.startDate : start,
      endDate: end > summary.period.endDate ? summary.period.endDate : end,
    });
  };

  return (
    <div style={{ flex: 1, minHeight: "100%", background: T.bg, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
            Operations
          </h1>
          <p style={{ fontSize: 18, fontWeight: 600, color: T.text, marginTop: 4 }} data-testid="text-productivity-title">
            Firm Productivity
          </p>
          <p style={{ fontSize: 12, color: T.textDim, marginTop: 3 }} data-testid="text-productivity-subtitle">
            Firm-wide time, activity and workload overview
          </p>
          {summary && (
            <p style={{ fontSize: 10, color: T.textFaint, marginTop: 6 }} data-testid="text-productivity-period">
              {summary.period.label} · {summary.permissions.scope === "self" ? "Your recorded activity" : "Firm-wide recorded activity"}
            </p>
          )}
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {hasActiveFilters && (
            <span style={{ fontSize: 10, color: T.textDim, display: "flex", alignItems: "center", gap: 4 }}>
              Filtered by: 
              {startDate || endDate ? formatDateRange(startDate, endDate) : ''}
              {matterId ? ` Matter #${matterId}` : ''}
              {clientId ? ` Client #${clientId}` : ''}
              {userId ? ` User #${userId}` : ''}
              {practiceArea ? ` Practice: ${practiceArea}` : ''}
              <button onClick={resetFilters} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.textFaint, padding: 2 }} aria-label="Clear filters" data-testid="button-clear-productivity-filters">
                <X size={10} />
              </button>
            </span>
          )}

          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <button
                data-testid="button-productivity-filters"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: hasActiveFilters ? T.surfaceEl : "transparent", 
                  border: `1px solid ${hasActiveFilters ? T.borderSub : T.border}`, 
                  color: hasActiveFilters ? T.text : T.textDim, cursor: "pointer",
                }}
              >
                <Filter size={12} /> Filters
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" style={{ width: 300, padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter Analytics</div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: T.textDim }}>Date Range</label>
                  <Select 
                    value={draftFilters.preset || "custom"}
                    onValueChange={v => {
                      if (v !== "custom") {
                        const preset = DATE_PRESETS.find(p => p.label === v)
                        if (preset) {
                          const r = preset.getRange()
                          setDraftFilters(p => ({ ...p, preset: v, startDate: format(r.start, 'yyyy-MM-dd'), endDate: format(r.end, 'yyyy-MM-dd') }))
                        }
                      } else {
                        setDraftFilters(p => ({ ...p, preset: "custom" }))
                      }
                    }}
                  >
                    <SelectTrigger style={fieldSx} data-testid="select-productivity-date-preset">
                      <SelectValue placeholder="Custom Range" />
                    </SelectTrigger>
                    <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                      <SelectItem value="custom" style={{ fontSize: 11, color: T.text }}>Custom Range</SelectItem>
                      {DATE_PRESETS.map(p => (
                        <SelectItem key={p.label} value={p.label} style={{ fontSize: 11, color: T.text }}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <input type="date" max={draftFilters.endDate || undefined} style={{...fieldSx, fontSize: 10}} value={draftFilters.startDate || ""} onChange={e => { setFilterError(null); setDraftFilters(p => ({...p, startDate: e.target.value, preset: "custom"})); }} data-testid="input-productivity-start-date" />
                    <input type="date" min={draftFilters.startDate || undefined} style={{...fieldSx, fontSize: 10}} value={draftFilters.endDate || ""} onChange={e => { setFilterError(null); setDraftFilters(p => ({...p, endDate: e.target.value, preset: "custom"})); }} data-testid="input-productivity-end-date" />
                  </div>
                  {filterError && <p style={{ color: T.warn, fontSize: 10, lineHeight: 1.4, margin: "3px 0 0" }} role="alert" data-testid="text-productivity-filter-error">{filterError}</p>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: T.textDim }}>Matter</label>
                  <Select 
                    value={draftFilters.matterId ? String(draftFilters.matterId) : "all"}
                    onValueChange={v => setDraftFilters(p => ({ ...p, matterId: v === "all" ? undefined : Number(v) }))}
                  >
                    <SelectTrigger style={fieldSx} data-testid="select-productivity-matter">
                      <SelectValue placeholder="All Matters" />
                    </SelectTrigger>
                    <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                      <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Matters</SelectItem>
                      {matters?.map(m => (
                        <SelectItem key={m.id} value={String(m.id)} style={{ fontSize: 11, color: T.text }}>{m.reference} - {m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: T.textDim }}>Client</label>
                  <Select 
                    value={draftFilters.clientId ? String(draftFilters.clientId) : "all"}
                    onValueChange={v => setDraftFilters(p => ({ ...p, clientId: v === "all" ? undefined : Number(v) }))}
                  >
                    <SelectTrigger style={fieldSx} data-testid="select-productivity-client">
                      <SelectValue placeholder="All Clients" />
                    </SelectTrigger>
                    <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                      <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Clients</SelectItem>
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)} style={{ fontSize: 11, color: T.text }}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: T.textDim }}>Team Member</label>
                  <Select 
                    value={draftFilters.userId ? String(draftFilters.userId) : "all"}
                    onValueChange={v => setDraftFilters(p => ({ ...p, userId: v === "all" ? undefined : Number(v) }))}
                  >
                    <SelectTrigger style={fieldSx} data-testid="select-productivity-user">
                      <SelectValue placeholder="All Members" />
                    </SelectTrigger>
                    <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                      <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Members</SelectItem>
                      {summary?.filterOptions?.users?.map(u => (
                        <SelectItem key={u.id} value={String(u.id)} style={{ fontSize: 11, color: T.text }}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: T.textDim }}>Practice Area</label>
                  <Select
                    value={draftFilters.practiceArea || "all"}
                    onValueChange={value => setDraftFilters(current => ({ ...current, practiceArea: value === "all" ? undefined : value }))}
                  >
                    <SelectTrigger style={fieldSx} data-testid="select-productivity-practice-area">
                      <SelectValue placeholder="All Practice Areas" />
                    </SelectTrigger>
                    <SelectContent style={{ background: T.surfaceB, border: `1px solid ${T.border}` }}>
                      <SelectItem value="all" style={{ fontSize: 11, color: T.text }}>All Practice Areas</SelectItem>
                      {summary?.filterOptions.practiceAreas.map(area => (
                        <SelectItem key={area} value={area} style={{ fontSize: 11, color: T.text }}>{area}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button onClick={resetFilters} style={{ background: "transparent", border: `1px solid ${T.border}`, padding: "6px 12px", borderRadius: 6, fontSize: 11, color: T.text, cursor: "pointer" }} data-testid="button-productivity-reset">Reset</button>
                  <button onClick={applyFilters} style={{ background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`, border: "none", padding: "6px 12px", borderRadius: 6, fontSize: 11, color: "#fff", fontWeight: 600, cursor: "pointer" }} data-testid="button-productivity-apply">Apply</button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={handleExport}
            data-testid="button-productivity-export"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
              border: "none", color: "#fff", cursor: "pointer",
            }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: "Total Hours", value: `${kpis?.totalHours.toFixed(1) || 0}`, icon: Clock, accent: T.blue },
          { label: "Activities Logged", value: `${kpis?.activitiesLogged || 0}`, icon: FileText, accent: T.cyan },
          { label: "Active Users", value: `${kpis?.activeUsers || 0}`, icon: Users, accent: T.text },
          { label: "Active Matters", value: `${kpis?.activeMatters || 0}`, icon: Briefcase, accent: T.text },
          { label: "Avg Hours/User", value: `${kpis?.averageHoursPerUser?.toFixed(1) || 0}`, icon: Users, accent: T.textDim },
          { label: "Avg Hours/Day", value: `${kpis?.averageHoursPerDay?.toFixed(1) || 0}`, icon: TrendingUp, accent: T.textDim },
        ].map((kpi, idx) => (
          <Link
            key={idx}
            href={buildTimeLink({})}
            style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8, color: "inherit" }}
            data-testid={`link-kpi-${kpi.label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <kpi.icon size={12} style={{ color: T.textFaint }} />
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint }}>
                {kpi.label}
              </span>
            </div>
            <span style={{ fontSize: 26, fontWeight: 300, color: kpi.accent, lineHeight: 1 }} data-testid={`kpi-${kpi.label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}>
              {kpi.value}
            </span>
            <span style={{ fontSize: 9, color: T.cyan, display: "inline-flex", alignItems: "center", gap: 4 }}>Trace entries <ExternalLink size={9} /></span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div style={{ ...cardStyle, padding: "18px 20px" }} className="lg:col-span-2">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
                Workload Distribution
              </h2>
              <p style={{ fontSize: 12, color: T.textDim, marginTop: 5 }}>Recorded time by practice area</p>
            </div>
            <Link href={buildTimeLink({})} style={{ color: T.cyan, fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5 }} data-testid="link-productivity-all-time">
              View entries <ExternalLink size={11} />
            </Link>
          </div>
          {summary?.practiceAreas.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {summary.practiceAreas.slice(0, 8).map(area => (
                <Link
                  key={area.practiceArea}
                  href={buildTimeLink({ practiceArea: area.practiceArea })}
                  style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1.1fr) minmax(120px, 3fr) 86px", gap: 12, alignItems: "center", color: "inherit" }}
                  data-testid={`link-practice-area-${area.practiceArea.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <span style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{area.practiceArea}</span>
                  <span style={{ height: 7, borderRadius: 10, background: T.surfaceEl, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.max(area.percentage, 1)}%`, background: `linear-gradient(90deg, ${T.blue}, ${T.cyan})`, borderRadius: 10 }} />
                  </span>
                  <span style={{ fontSize: 11, color: T.textDim, textAlign: "right" }}>{area.totalHours.toFixed(1)}h · {area.percentage}%</span>
                </Link>
              ))}
            </div>
          ) : (
            <p style={{ color: T.textFaint, fontSize: 12, margin: 0 }}>No matters have recorded activity during the selected period.</p>
          )}
        </div>
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
            Available Analysis
          </h2>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 15 }}>
            <AlertCircle size={14} style={{ color: T.warn, flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: T.textDim, fontSize: 11, lineHeight: 1.6, margin: 0 }} data-testid="text-productivity-unavailable-dimensions">
              Activity type, team, department and task metrics are unavailable because the current Time Tracker does not capture those fields. No categories have been inferred from descriptions.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Trend Chart */}
        <div style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }} className="lg:col-span-2">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
              Activity Trend
            </h3>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(Object.keys(trendMetricLabels) as Array<keyof typeof trendMetricLabels>).map(metric => (
                <button
                  key={metric}
                  type="button"
                  onClick={() => setTrendMetric(metric)}
                  data-testid={`button-trend-${metric}`}
                  style={{ border: `1px solid ${trendMetric === metric ? T.cyan : T.border}`, background: trendMetric === metric ? T.surfaceEl : "transparent", color: trendMetric === metric ? T.cyan : T.textDim, borderRadius: 5, padding: "4px 7px", fontSize: 9, cursor: "pointer" }}
                >
                  {trendMetricLabels[metric]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 260, width: "100%" }}>
            {summary?.trend && summary.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.trend}>
                  <defs>
                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={T.cyan} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={T.cyan} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.borderSub} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: T.textFaint }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: T.textFaint }} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: T.surfaceB, borderColor: T.border, borderRadius: 6, fontSize: 12, color: T.text }}
                    itemStyle={{ color: T.text }}
                  />
                  <Area type="monotone" dataKey={trendMetric} name={trendMetricLabels[trendMetric]} stroke={T.cyan} strokeWidth={2} fillOpacity={1} fill="url(#colorTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.textFaint, fontSize: 12 }}>
                No trend data available for this period.
              </div>
            )}
          </div>
          {summary?.trend.length ? (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {summary.trend.map(point => (
                <Link
                  key={point.period}
                  href={trendPointLink(point.period)}
                  style={{ color: T.textDim, border: `1px solid ${T.borderSub}`, background: T.surfaceEl, borderRadius: 5, padding: "5px 7px", fontSize: 9, whiteSpace: "nowrap" }}
                  data-testid={`link-trend-${point.period}`}
                >
                  {point.label}: {point[trendMetric]}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {/* Time-entry logging patterns */}
        <div style={{ ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h3 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
              Time-Entry Logging Patterns
            </h3>
            <p style={{ color: T.textFaint, fontSize: 9, lineHeight: 1.45, margin: "5px 0 0" }}>Based on record creation timestamps, not when the work occurred.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            {[
              { label: "Busiest Logging Day", value: busiestDay },
              { label: "Peak Logging Time", value: peakTime },
              { label: "Hours Entered AM", value: patterns?.morningHours?.toFixed(1) || "0.0" },
              { label: "Hours Entered PM", value: patterns?.afternoonHours?.toFixed(1) || "0.0" },
              { label: "Hours Entered After 18:00", value: patterns?.afterHours?.toFixed(1) || "0.0" },
            ].map((pattern, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${T.borderSub}`, paddingBottom: 10 }}>
                <span style={{ fontSize: 11, color: T.textDim }}>{pattern.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }} data-testid={`text-pattern-${pattern.label.replace(/\s+/g, '-').toLowerCase()}`}>
                  {pattern.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Secondary Grid (Tables) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Employee activity */}
        <div style={{ ...cardStyle, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
            <h3 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
              Employee Activity
            </h3>
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint }}>Employee</TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setUserSort("hours")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-users-hours">Hours</button>
                   </TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setUserSort("activities")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-users-activities">Activities</button>
                   </TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setUserSort("matters")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-users-matters">Matters</button>
                   </TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setUserSort("average")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-users-average">Avg/day</button>
                   </TableHead>
                  <TableHead style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint, textAlign: "center" }}>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map(user => (
                  <TableRow key={user.userId} style={{ borderBottom: `1px solid ${T.borderSub}` }}>
                    <TableCell style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{user.userName}</TableCell>
                    <TableCell style={{ fontSize: 12, fontWeight: 600, color: T.text, textAlign: "right", fontFamily: "monospace" }}>{user.totalHours.toFixed(1)}</TableCell>
                    <TableCell style={{ fontSize: 11, color: T.textDim, textAlign: "right" }}>{user.activities}</TableCell>
                    <TableCell style={{ fontSize: 11, color: T.textDim, textAlign: "right" }}>{user.mattersWorkedOn}</TableCell>
                    <TableCell style={{ fontSize: 11, color: T.textDim, textAlign: "right" }}>{user.averageHoursPerDay.toFixed(1)}</TableCell>
                    <TableCell style={{ textAlign: "center" }}>
                      <Link href={buildTimeLink({ userId: user.userId })} data-testid={`link-user-time-${user.userId}`} style={{ color: T.cyan, display: "inline-flex" }}>
                        <ExternalLink size={12} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!summary?.users?.length && (
                  <TableRow>
                    <TableCell colSpan={6} style={{ textAlign: "center", color: T.textFaint, fontSize: 11, padding: 24 }}>No employees recorded time during this period.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Matter activity */}
        <div style={{ ...cardStyle, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
            <h3 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
               Matter Activity
            </h3>
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
                  <TableHead style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint }}>Matter</TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setMatterSort("hours")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-matters-hours">Hours</button>
                   </TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setMatterSort("activities")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-matters-activities">Activities</button>
                   </TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setMatterSort("users")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-matters-users">Users</button>
                   </TableHead>
                   <TableHead style={{ fontSize: 9, fontWeight: 700, color: T.textFaint, textAlign: "right" }}>
                     <button type="button" onClick={() => setMatterSort("recent")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }} data-testid="button-sort-matters-recent">Last</button>
                   </TableHead>
                  <TableHead style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.textFaint, textAlign: "center" }}>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMatters.map(matter => (
                  <TableRow key={matter.matterId} style={{ borderBottom: `1px solid ${T.borderSub}` }}>
                    <TableCell style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <Link href={`/matters/${matter.matterId}`} style={{ color: T.text }} data-testid={`link-productivity-matter-${matter.matterId}`}>{matter.reference} · {matter.title}</Link>
                        <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400 }}>{matter.clientName}</span>
                      </div>
                    </TableCell>
                    <TableCell style={{ fontSize: 12, fontWeight: 600, color: T.text, textAlign: "right", fontFamily: "monospace" }}>{matter.totalHours.toFixed(1)}</TableCell>
                    <TableCell style={{ fontSize: 11, color: T.textDim, textAlign: "right" }}>{matter.activities}</TableCell>
                    <TableCell style={{ fontSize: 11, color: T.textDim, textAlign: "right" }}>{matter.activeUsers}</TableCell>
                    <TableCell style={{ fontSize: 10, color: T.textDim, textAlign: "right", whiteSpace: "nowrap" }}>{format(new Date(matter.lastActivity), "dd MMM yyyy")}</TableCell>
                    <TableCell style={{ textAlign: "center" }}>
                      <Link href={buildTimeLink({ matterId: matter.matterId })} data-testid={`link-matter-time-${matter.matterId}`} style={{ color: T.cyan, display: "inline-flex" }}>
                        <ExternalLink size={12} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!summary?.matters?.length && (
                  <TableRow>
                    <TableCell colSpan={6} style={{ textAlign: "center", color: T.textFaint, fontSize: 11, padding: 24 }}>No matters have recorded activity during the selected period.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section style={{ ...cardStyle, padding: "18px 20px" }} className="lg:col-span-2">
          <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
            Productivity Insights
          </h2>
          <div style={{ display: "grid", gap: 10, marginTop: 15 }}>
            {(summary?.insights.length ? summary.insights : ["Insufficient data to generate this insight."]).map((insight, index) => (
              <div key={`${insight}-${index}`} style={{ display: "flex", gap: 9, padding: "11px 12px", background: T.surfaceEl, border: `1px solid ${T.borderSub}`, borderRadius: 6 }}>
                <TrendingUp size={13} style={{ color: T.cyan, flexShrink: 0, marginTop: 1 }} />
                <p style={{ color: T.textDim, fontSize: 11, lineHeight: 1.55, margin: 0 }} data-testid={`text-productivity-insight-${index}`}>{insight}</p>
              </div>
            ))}
          </div>
        </section>
        <section style={{ ...cardStyle, padding: "18px 20px" }}>
          <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
            Time Tracking Health
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px 14px", marginTop: 15 }}>
            {[
              ["Total entries", summary?.health.totalEntries ?? 0],
              ["Entries needing review", summary?.health.incompleteEntries ?? 0],
              ["Missing entry date", summary?.health.missingDate ?? 0],
              ["Missing description", summary?.health.missingDescription ?? 0],
              ["Incomplete duration", summary?.health.incompleteDuration ?? 0],
            ].map(([label, value]) => (
              <React.Fragment key={label}>
                <span style={{ color: T.textDim, fontSize: 11 }}>{label}</span>
                <strong style={{ color: Number(value) > 0 && label !== "Total entries" ? T.warn : T.text, fontSize: 12 }} data-testid={`metric-health-${String(label).replace(/\s+/g, "-").toLowerCase()}`}>{value}</strong>
              </React.Fragment>
            ))}
          </div>
          <Link href={buildTimeLink({})} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: T.cyan, fontSize: 10, marginTop: 17 }} data-testid="link-health-time-entries">
            Review source entries <ExternalLink size={11} />
          </Link>
        </section>
      </div>

      <section style={{ ...cardStyle, padding: "18px 20px" }}>
        <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: T.textFaint, margin: 0 }}>
          Matter Workload Indicators
        </h2>
        <p style={{ fontSize: 11, color: T.textDim, margin: "5px 0 0" }}>Analytical indicators only; “inactive” means an active-status matter with no recorded activity in the selected report period. Recorded hours do not imply matter quality or employee performance.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" style={{ marginTop: 15 }}>
          {[
            { label: "High recorded activity", items: summary?.workload.highActivityMatters ?? [] },
            { label: "Low recorded activity", items: summary?.workload.lowActivityMatters ?? [] },
            { label: "Inactive in selected period", items: summary?.workload.inactiveMatters ?? [] },
            { label: "Concentrated activity", items: summary?.workload.concentratedMatters ?? [] },
          ].map(group => (
            <div key={group.label} style={{ background: T.surfaceEl, border: `1px solid ${T.borderSub}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column" }}>
              <strong style={{ color: T.textFaint, fontSize: 9, lineHeight: 1.35, textTransform: "uppercase", letterSpacing: "0.08em", minHeight: 24, display: "flex", alignItems: "flex-start" }}>{group.label}</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 10, minHeight: 72, alignContent: "start" }}>
                {group.items.length ? group.items.map(item => (
                  <Link key={item.matterId} href={`/matters/${item.matterId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, minWidth: 0, width: "100%", color: T.textDim, fontSize: 11 }} data-testid={`link-workload-matter-${group.label.replace(/\s+/g, "-").toLowerCase()}-${item.matterId}`}>
                    <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.35 }}>{item.reference} · {item.title}</span>
                    <span style={{ color: T.text, whiteSpace: "nowrap", flexShrink: 0 }}>{item.totalHours.toFixed(1)}h</span>
                  </Link>
                )) : <span style={{ color: T.textFaint, fontSize: 11 }}>Insufficient data for this indicator.</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
