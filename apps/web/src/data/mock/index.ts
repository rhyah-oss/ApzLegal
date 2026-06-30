import type {
  AiMessage,
  AuditLog,
  CalendarEvent,
  Document,
  EmailThread,
  Matter,
  Party,
  Task,
  Template,
  TimeEntry,
  WorkflowItem,
} from "@/types";

export const currentUser = {
  name: "Adv. N. Mbeki",
  role: "Partner",
  email: "n.mbeki@smithpartners.co.za",
  initials: "NM",
};

export const firm = {
  name: "Smith & Partners Inc.",
  jurisdiction: "South Africa",
};

export const matters: Matter[] = [
  {
    id: "m1",
    reference: "2024/LIT/0847",
    title: "Nkosi v Transvaal Logistics (Pty) Ltd — Unlawful Dismissal",
    status: "open",
    practiceArea: "Labour Law",
    client: "S. Nkosi",
    lead: "Adv. N. Mbeki",
    openedAt: "2024-03-12",
    nextDeadline: "2026-06-20",
    unbilledHours: 14.5,
    pendingApprovals: 2,
  },
  {
    id: "m2",
    reference: "2024/COM/0312",
    title: "Meridian Holdings — Share Purchase Agreement Review",
    status: "open",
    practiceArea: "Commercial",
    client: "Meridian Holdings (Pty) Ltd",
    lead: "Adv. L. van der Merwe",
    openedAt: "2024-08-01",
    nextDeadline: "2026-06-25",
    unbilledHours: 8.0,
    pendingApprovals: 1,
  },
  {
    id: "m3",
    reference: "2023/LIT/1204",
    title: "City of Johannesburg v Khumalo — PAJA Review",
    status: "pending",
    practiceArea: "Administrative Law",
    client: "T. Khumalo",
    lead: "Adv. N. Mbeki",
    openedAt: "2023-11-05",
    nextDeadline: "2026-07-02",
    unbilledHours: 22.0,
    pendingApprovals: 0,
  },
  {
    id: "m4",
    reference: "2024/FAM/0091",
    title: "Pillay v Pillay — Divorce & Asset Division",
    status: "open",
    practiceArea: "Family Law",
    client: "R. Pillay",
    lead: "Adv. S. Dlamini",
    openedAt: "2024-01-18",
    unbilledHours: 6.5,
    pendingApprovals: 0,
  },
  {
    id: "m5",
    reference: "2022/COM/0440",
    title: "Apex Mining — BEE Compliance Audit",
    status: "closed",
    practiceArea: "Commercial",
    client: "Apex Mining Ltd",
    lead: "Adv. L. van der Merwe",
    openedAt: "2022-06-14",
    closedAt: "2025-12-01",
    unbilledHours: 0,
    pendingApprovals: 0,
  },
];

export const parties: Record<string, Party[]> = {
  m1: [
    { id: "p1", name: "Sibusiso Nkosi", role: "client" },
    { id: "p2", name: "Transvaal Logistics (Pty) Ltd", role: "opponent" },
    { id: "p3", name: "CCMA Commissioner", role: "third_party" },
  ],
  m2: [
    { id: "p4", name: "Meridian Holdings (Pty) Ltd", role: "client" },
    { id: "p5", name: "TargetCo (Pty) Ltd", role: "third_party" },
  ],
};

export const documents: Document[] = [
  { id: "d1", matterId: "m1", name: "Statement of Claim.pdf", folder: "Pleadings", type: "PDF", size: "842 KB", updatedAt: "2026-05-28" },
  { id: "d2", matterId: "m1", name: "Employer Response.docx", folder: "Pleadings", type: "DOCX", size: "124 KB", updatedAt: "2026-06-02" },
  { id: "d3", matterId: "m1", name: "Nkosi Employment Contract.pdf", folder: "Evidence", type: "PDF", size: "356 KB", updatedAt: "2026-04-15" },
  { id: "d4", matterId: "m1", name: "Disciplinary Hearing Transcript.pdf", folder: "Evidence", type: "PDF", size: "1.2 MB", updatedAt: "2026-04-20" },
  { id: "d5", matterId: "m1", name: "Heads of Argument — Draft.docx", folder: "Drafts", type: "DOCX", size: "98 KB", updatedAt: "2026-06-10" },
  { id: "d6", matterId: "m2", name: "SPA — v3 Marked Up.docx", folder: "Contracts", type: "DOCX", size: "412 KB", updatedAt: "2026-06-08" },
  { id: "d7", matterId: "m2", name: "Due Diligence Report.pdf", folder: "Due Diligence", type: "PDF", size: "3.4 MB", updatedAt: "2026-05-30" },
];

export const aiMessages: AiMessage[] = [
  {
    id: "msg1",
    role: "user",
    content: "What are the key requirements for an automatically unfair dismissal under the LRA in this matter?",
  },
  {
    id: "msg2",
    role: "assistant",
    content:
      "Based on the available corpus, an automatically unfair dismissal under the Labour Relations Act 66 of 1995 (LRA) requires proof that the reason for dismissal falls within the grounds listed in section 187(1)(f). In Nkosi v Transvaal Logistics, the pleaded case alleges dismissal for participation in protected strike action.\n\nKey requirements:\n1. The employee must establish a dismissal occurred (s186).\n2. The reason must relate to a ground in s187(1)(f) — here, participation in a protected strike.\n3. The onus shifts to the employer to prove the reason was fair if the employee makes a prima facie case.\n\nThe employer's disciplinary record (Exhibit C) does not reference strike participation as the stated reason, which may weaken their defence.",
    confidence: "medium",
    corpusWarning: false,
    citations: [
      {
        id: "c1",
        sourceTitle: "Labour Relations Act 66 of 1995",
        sourceType: "statute",
        reference: "s187(1)(f)",
        excerpt: "A dismissal is automatically unfair if the reason for the dismissal is that the employee participated in a protected strike...",
        confidence: 94,
        status: "verified",
      },
      {
        id: "c2",
        sourceTitle: "Statement of Claim — Nkosi v Transvaal Logistics",
        sourceType: "document",
        reference: "¶14–18",
        excerpt: "The applicant alleges his dismissal was linked to participation in the protected strike of 14–16 January 2026.",
        confidence: 88,
        status: "verified",
      },
      {
        id: "c3",
        sourceTitle: "Employer Disciplinary Outcome Letter",
        sourceType: "document",
        reference: "p2",
        excerpt: "Reason given: gross insubordination and failure to follow reasonable instruction.",
        confidence: 72,
        status: "unverified",
      },
    ],
  },
];

export const emailThreads: EmailThread[] = [
  {
    id: "e1",
    matterId: "m1",
    subject: "RE: CCMA Referral — Nkosi matter",
    from: "opposing@transvaallogistics.co.za",
    date: "2026-06-11T09:14:00",
    preview: "We dispute the characterization of the strike as protected and request...",
    attachments: 1,
    approvalStatus: "in_review",
  },
  {
    id: "e2",
    matterId: "m1",
    subject: "Draft reply to CCMA — for approval",
    from: "n.mbeki@smithpartners.co.za",
    date: "2026-06-11T14:30:00",
    preview: "Dear Commissioner, We refer to the above matter and wish to place on record...",
    attachments: 0,
    approvalStatus: "draft",
  },
  {
    id: "e3",
    matterId: "m2",
    subject: "SPA — indemnity clause concerns",
    from: "l.vdm@smithpartners.co.za",
    date: "2026-06-10T11:00:00",
    preview: "Client has flagged the cap on indemnities in clause 12.4...",
    attachments: 2,
    approvalStatus: "approved",
  },
];

export const workflowItems: WorkflowItem[] = [
  { id: "w1", title: "Heads of Argument — Nkosi", type: "document", matterRef: "2024/LIT/0847", status: "in_review", assignee: "Adv. N. Mbeki", dueAt: "2026-06-18" },
  { id: "w2", title: "Reply to CCMA — Nkosi", type: "email", matterRef: "2024/LIT/0847", status: "draft", assignee: "Adv. N. Mbeki", dueAt: "2026-06-12" },
  { id: "w3", title: "Legal opinion — BEE warranty", type: "opinion", matterRef: "2024/COM/0312", status: "changes_requested", assignee: "Adv. L. van der Merwe", dueAt: "2026-06-20" },
  { id: "w4", title: "SPA indemnity amendment", type: "contract", matterRef: "2024/COM/0312", status: "approved", assignee: "Adv. L. van der Merwe", dueAt: "2026-06-15" },
  { id: "w5", title: "Time entries — May 2026", type: "billing", matterRef: "2024/LIT/0847", status: "in_review", assignee: "Billing Admin", dueAt: "2026-06-14" },
];

export const timeEntries: TimeEntry[] = [
  { id: "t1", matterRef: "2024/LIT/0847", description: "Review employer disciplinary bundle", durationMinutes: 90, rateCents: 450000, billable: true, status: "approved", entryDate: "2026-06-09", user: "Adv. N. Mbeki" },
  { id: "t2", matterRef: "2024/LIT/0847", description: "Draft heads of argument", durationMinutes: 180, rateCents: 450000, billable: true, status: "submitted", entryDate: "2026-06-10", user: "Adv. N. Mbeki" },
  { id: "t3", matterRef: "2024/COM/0312", description: "SPA clause 12 review", durationMinutes: 60, rateCents: 380000, billable: true, status: "approved", entryDate: "2026-06-08", user: "Adv. L. van der Merwe" },
  { id: "t4", matterRef: "2024/LIT/0847", description: "AI research session — LRA s187", durationMinutes: 45, rateCents: 450000, billable: true, status: "draft", entryDate: "2026-06-11", user: "Adv. N. Mbeki" },
];

export const tasks: Task[] = [
  { id: "tk1", matterRef: "2024/LIT/0847", title: "File heads of argument", assignee: "Adv. N. Mbeki", dueAt: "2026-06-18", done: false },
  { id: "tk2", matterRef: "2024/LIT/0847", title: "Obtain witness statement — shop steward", assignee: "Paralegal", dueAt: "2026-06-15", done: false },
  { id: "tk3", matterRef: "2024/COM/0312", title: "Circulate SPA v4 to client", assignee: "Adv. L. van der Merwe", dueAt: "2026-06-13", done: true },
  { id: "tk4", matterRef: "2023/LIT/1204", title: "Prepare supplementary affidavit", assignee: "Adv. N. Mbeki", dueAt: "2026-07-01", done: false },
];

export const templates: Template[] = [
  { id: "tp1", name: "Letter of Demand", category: "Correspondence", updatedAt: "2026-01-10" },
  { id: "tp2", name: "Heads of Argument — Labour Court", category: "Litigation", updatedAt: "2025-11-22" },
  { id: "tp3", name: "Memorandum of Incorporation — Standard", category: "Corporate", updatedAt: "2026-03-05" },
  { id: "tp4", name: "Settlement Agreement", category: "Litigation", updatedAt: "2025-09-18" },
];

export const calendarEvents: CalendarEvent[] = [
  { id: "cal1", title: "CCMA Conciliation — Nkosi", matterRef: "2024/LIT/0847", date: "2026-06-20", type: "hearing" },
  { id: "cal2", title: "SPA signing deadline", matterRef: "2024/COM/0312", date: "2026-06-25", type: "deadline" },
  { id: "cal3", title: "Partner meeting", date: "2026-06-13", type: "meeting" },
  { id: "cal4", title: "Answering affidavit due — Khumalo", matterRef: "2023/LIT/1204", date: "2026-07-02", type: "deadline" },
];

export const auditLogs: AuditLog[] = [
  { id: "a1", action: "document.view", user: "Adv. N. Mbeki", entity: "Heads of Argument — Draft.docx", matterRef: "2024/LIT/0847", timestamp: "2026-06-11T16:02:00" },
  { id: "a2", action: "ai.query", user: "Adv. N. Mbeki", entity: "Legal AI session", matterRef: "2024/LIT/0847", timestamp: "2026-06-11T15:45:00" },
  { id: "a3", action: "citation.approve", user: "Adv. N. Mbeki", entity: "LRA s187(1)(f)", matterRef: "2024/LIT/0847", timestamp: "2026-06-11T15:50:00" },
  { id: "a4", action: "email.draft", user: "Adv. N. Mbeki", entity: "Reply to CCMA", matterRef: "2024/LIT/0847", timestamp: "2026-06-11T14:30:00" },
  { id: "a5", action: "workflow.submit", user: "Adv. L. van der Merwe", entity: "Legal opinion — BEE warranty", matterRef: "2024/COM/0312", timestamp: "2026-06-10T17:00:00" },
];

export const researchResults = [
  { id: "r1", title: "Labour Relations Act 66 of 1995", type: "Statute", ref: "s187, s188, s191", relevance: 96 },
  { id: "r2", title: "NUMSA v Lufil Packaging (2015) 36 ILJ 1403 (LC)", type: "Judgment", ref: "¶24–31", relevance: 89 },
  { id: "r3", title: "Statement of Claim — Nkosi", type: "Firm document", ref: "¶14–18", relevance: 85 },
  { id: "r4", title: "Basic Conditions of Employment Act 75 of 1997", type: "Statute", ref: "s34", relevance: 62 },
];

export function getMatter(id: string) {
  return matters.find((m) => m.id === id);
}

export function getMatterDocuments(matterId: string) {
  return documents.filter((d) => d.matterId === matterId);
}
