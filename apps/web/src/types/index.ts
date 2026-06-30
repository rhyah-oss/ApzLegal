export type MatterStatus = "open" | "pending" | "closed" | "archived";

export type VerificationStatus = "verified" | "unverified" | "not_found" | "pending";

export type WorkflowStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "sent"
  | "filed"
  | "archived";

export type Matter = {
  id: string;
  reference: string;
  title: string;
  status: MatterStatus;
  practiceArea: string;
  client: string;
  lead: string;
  openedAt: string;
  closedAt?: string;
  nextDeadline?: string;
  unbilledHours: number;
  pendingApprovals: number;
};

export type Party = {
  id: string;
  name: string;
  role: "client" | "opponent" | "third_party" | "witness";
};

export type Document = {
  id: string;
  matterId: string;
  name: string;
  folder: string;
  type: string;
  size: string;
  updatedAt: string;
};

export type Citation = {
  id: string;
  sourceTitle: string;
  sourceType: "judgment" | "statute" | "document" | "email";
  reference: string;
  excerpt: string;
  confidence: number;
  status: VerificationStatus;
};

export type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: "low" | "medium" | "high";
  corpusWarning?: boolean;
  citations?: Citation[];
};

export type EmailThread = {
  id: string;
  matterId?: string;
  subject: string;
  from: string;
  date: string;
  preview: string;
  attachments: number;
  approvalStatus?: WorkflowStatus;
};

export type WorkflowItem = {
  id: string;
  title: string;
  type: "document" | "email" | "opinion" | "contract" | "billing";
  matterRef: string;
  status: WorkflowStatus;
  assignee: string;
  dueAt: string;
};

export type TimeEntry = {
  id: string;
  matterRef: string;
  description: string;
  durationMinutes: number;
  rateCents: number;
  billable: boolean;
  status: "draft" | "submitted" | "approved" | "invoiced";
  entryDate: string;
  user: string;
};

export type Task = {
  id: string;
  matterRef: string;
  title: string;
  assignee: string;
  dueAt: string;
  done: boolean;
};

export type AuditLog = {
  id: string;
  action: string;
  user: string;
  entity: string;
  matterRef?: string;
  timestamp: string;
};

export type Template = {
  id: string;
  name: string;
  category: string;
  updatedAt: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  matterRef?: string;
  date: string;
  type: "hearing" | "deadline" | "meeting";
};
