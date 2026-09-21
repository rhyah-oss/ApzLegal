import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  emailAttachmentsTable,
  emailLinkCandidatesTable,
  emailThreadsTable,
  emailsTable,
  mattersTable,
  type Email,
} from "@workspace/db";
import type { CurrentUser } from "./context";

export const ASSIGNMENT_RESTRICTED_ROLES = new Set([
  "candidate_attorney",
  "paralegal",
  "secretary",
  "legal_secretary",
]);

export async function getAccessibleMatter(user: CurrentUser, matterId: number) {
  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, matterId));
  if (!matter) return null;
  if (ASSIGNMENT_RESTRICTED_ROLES.has(user.role) && matter.assignedToId !== user.id) return null;
  return matter;
}

export async function getAuthorizedEmail(user: CurrentUser, emailId: number, matterId?: number) {
  const [email] = await db.select().from(emailsTable).where(
    matterId == null
      ? eq(emailsTable.id, emailId)
      : and(eq(emailsTable.id, emailId), eq(emailsTable.matterId, matterId)),
  );
  if (!email) return null;
  if (email.matterId == null) return { email, matter: null };
  const matter = await getAccessibleMatter(user, email.matterId);
  return matter ? { email, matter } : null;
}

export async function listMatterEmails(user: CurrentUser, matterId: number, options: {
  search?: string;
  unread?: boolean;
  linkStatus?: string;
  limit?: number;
}) {
  const matter = await getAccessibleMatter(user, matterId);
  if (!matter) return null;
  const filters = [eq(emailsTable.matterId, matterId)];
  if (options.unread) filters.push(eq(emailsTable.isRead, false));
  if (options.linkStatus) filters.push(eq(emailsTable.linkStatus, options.linkStatus));
  if (options.search?.trim()) {
    const query = `%${options.search.trim()}%`;
    filters.push(or(
      ilike(emailsTable.subject, query),
      ilike(emailsTable.senderEmail, query),
      ilike(emailsTable.senderName, query),
      ilike(emailsTable.bodyText, query),
    )!);
  }
  const rows = await db.select().from(emailsTable)
    .where(and(...filters))
    .orderBy(desc(emailsTable.receivedAt))
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 200));
  return rows;
}

export async function searchAuthorizedEmails(user: CurrentUser, search: string, matterId?: number) {
  const query = `%${search.trim()}%`;
  const matters = await db.select({ id: mattersTable.id }).from(mattersTable);
  const allowedMatterIds = matters
    .filter((matter) => !ASSIGNMENT_RESTRICTED_ROLES.has(user.role) || matter.id)
    .map((matter) => matter.id);
  if (ASSIGNMENT_RESTRICTED_ROLES.has(user.role)) {
    const assigned = await db.select({ id: mattersTable.id }).from(mattersTable).where(eq(mattersTable.assignedToId, user.id));
    allowedMatterIds.splice(0, allowedMatterIds.length, ...assigned.map((matter) => matter.id));
  }
  const filters = [
    or(ilike(emailsTable.subject, query), ilike(emailsTable.senderEmail, query), ilike(emailsTable.bodyText, query))!,
    allowedMatterIds.length ? inArray(emailsTable.matterId, allowedMatterIds) : sql`false`,
  ];
  if (matterId != null) filters.push(eq(emailsTable.matterId, matterId));
  return db.select().from(emailsTable).where(and(...filters)).orderBy(desc(emailsTable.receivedAt)).limit(100);
}

export function normalizeEmailRecord(email: Email) {
  return {
    ...email,
    bodyText: email.bodyText ?? "",
    toRecipients: email.toRecipients ?? [],
    ccRecipients: email.ccRecipients ?? [],
    bccRecipients: email.bccRecipients ?? [],
    matchConfidence: email.matchConfidence ?? null,
  };
}

export async function getEmailAttachments(emailId: number) {
  return db.select().from(emailAttachmentsTable).where(eq(emailAttachmentsTable.emailId, emailId));
}

export async function getEmailThread(user: CurrentUser, emailId: number, matterId: number) {
  const selected = await getAuthorizedEmail(user, emailId, matterId);
  if (!selected) return null;
  return db.select().from(emailsTable)
    .where(and(eq(emailsTable.threadId, selected.email.threadId), eq(emailsTable.matterId, matterId)))
    .orderBy(emailsTable.receivedAt);
}

export type NormalizedInboundAttachment = {
  externalAttachmentId?: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  fileChecksum: string;
};

export type NormalizedInboundEmail = {
  provider: string;
  externalMessageId: string;
  externalThreadId: string;
  direction?: "inbound" | "outbound";
  senderEmail: string;
  senderName?: string;
  toRecipients?: string[];
  ccRecipients?: string[];
  bccRecipients?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  headers?: Record<string, string>;
  sentAt?: Date;
  receivedAt: Date;
  attachments?: NormalizedInboundAttachment[];
};

export async function ingestNormalizedEmail(input: NormalizedInboundEmail) {
  const existing = await db.select().from(emailsTable).where(and(
    eq(emailsTable.provider, input.provider),
    eq(emailsTable.externalMessageId, input.externalMessageId),
  ));
  if (existing[0]) return { email: normalizeEmailRecord(existing[0]), duplicate: true };

  const content = [input.subject, input.bodyText, input.bodyHtml, input.headers?.["x-matter-reference"]].filter(Boolean).join("\n").toLowerCase();
  const allMatters = await db.select({
    matter: mattersTable,
    clientName: clientsTable.name,
    clientEmail: clientsTable.email,
  }).from(mattersTable).leftJoin(clientsTable, eq(clientsTable.id, mattersTable.clientId));
  const existingThread = await db.select().from(emailThreadsTable).where(and(
    eq(emailThreadsTable.provider, input.provider),
    eq(emailThreadsTable.externalThreadId, input.externalThreadId),
  ));
  const threadMatterId = existingThread[0]?.matterId ?? null;

  const candidates = allMatters.map(({ matter, clientName, clientEmail }) => {
    const participantText = [
      input.senderEmail,
      ...(input.toRecipients ?? []),
      ...(input.ccRecipients ?? []),
      ...(input.bccRecipients ?? []),
    ].join(" ").toLowerCase();
    if (threadMatterId === matter.id) return { matterId: matter.id, score: 100, reason: "Matched an existing provider thread.", source: "thread" };
    if (content.includes(matter.reference.toLowerCase())) return { matterId: matter.id, score: 95, reason: `Matched Matter reference ${matter.reference}.`, source: "reference" };
    if (clientEmail && participantText.includes(clientEmail.toLowerCase())) return { matterId: matter.id, score: 80, reason: `Matched an authorised client email for ${clientName ?? "the client"}.`, source: "participant" };
    if (clientName && content.includes(clientName.toLowerCase())) return { matterId: matter.id, score: 65, reason: `Matched the existing client name ${clientName}.`, source: "client" };
    if (matter.title && content.includes(matter.title.toLowerCase())) return { matterId: matter.id, score: 55, reason: "Matched Matter title text.", source: "subject" };
    return null;
  }).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)).sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const shouldLink = Boolean(top && top.score >= 95);

  const thread = existingThread[0] ?? (await db.insert(emailThreadsTable).values({
    provider: input.provider,
    externalThreadId: input.externalThreadId,
    subject: input.subject ?? null,
    matterId: shouldLink ? top!.matterId : null,
    clientId: shouldLink ? allMatters.find(({ matter }) => matter.id === top!.matterId)?.matter.clientId ?? null : null,
    lastMessageAt: input.receivedAt,
  }).returning())[0];
  if (!thread) throw new Error("Unable to create email thread");

  const email = (await db.insert(emailsTable).values({
    provider: input.provider,
    externalMessageId: input.externalMessageId,
    threadId: thread.id,
    direction: input.direction ?? "inbound",
    senderEmail: input.senderEmail,
    senderName: input.senderName,
    toRecipients: input.toRecipients ?? [],
    ccRecipients: input.ccRecipients ?? [],
    bccRecipients: input.bccRecipients ?? [],
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    headers: input.headers,
    sentAt: input.sentAt,
    receivedAt: input.receivedAt,
    matterId: shouldLink ? top!.matterId : null,
    clientId: shouldLink ? allMatters.find(({ matter }) => matter.id === top!.matterId)?.matter.clientId ?? null : null,
    linkStatus: shouldLink ? "linked" : top ? "suggested" : "unlinked",
    matchReason: top?.reason,
    matchConfidence: top?.score,
  }).returning())[0];
  if (!email) throw new Error("Unable to create email");
  if (candidates.length) {
    await db.insert(emailLinkCandidatesTable).values(candidates.map((candidate) => ({
      emailId: email.id,
      matterId: candidate.matterId,
      score: candidate.score,
      reason: candidate.reason,
      source: candidate.source,
      decision: shouldLink && candidate.matterId === top!.matterId ? "accepted" : "pending",
    }))).onConflictDoNothing();
  }
  if (input.attachments?.length) {
    await db.insert(emailAttachmentsTable).values(input.attachments.map((attachment) => ({
      emailId: email.id,
      provider: input.provider,
      externalAttachmentId: attachment.externalAttachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      fileChecksum: attachment.fileChecksum,
    }))).onConflictDoNothing();
  }
  return { email: normalizeEmailRecord(email), duplicate: false, candidates };
}