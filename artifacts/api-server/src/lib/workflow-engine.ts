// ── APZ Legal Workflow Engine ────────────────────────────────────────────────
// Central definition layer for the five governed firm workflows. The engine is
// deliberately a *projection*: the single source of truth for each workflow's
// state remains the module's own status fields (matters, documents, invoices,
// knowledge). Definitions here describe WHO does WHAT, in what ORDER, and what
// BLOCKS the next step; projection functions map live entity state onto a step.
// This guarantees the engine can never drift from the module-level gates that
// actually enforce the rules server-side.

export interface WorkflowStepDef {
  key: string;
  label: string;
  /** Roles responsible for completing this step. Empty = any authenticated user / client-side party. */
  responsibleRoles: string[];
  /** Whether an explicit partner-level approval gate protects the exit of this step. */
  requiresApproval: boolean;
  /** Human description of what must happen before the workflow may advance. */
  blockingCondition: string;
}

export interface WorkflowDef {
  key: string;
  name: string;
  entityType: string;
  description: string;
  steps: WorkflowStepDef[];
}

const PARTNERS = ["partner", "managing_partner", "admin"];
const ATTORNEYS = ["associate_attorney", "partner", "managing_partner", "admin"];
const ANY_STAFF: string[] = [];

export const WORKFLOW_DEFINITIONS: WorkflowDef[] = [
  {
    key: "new_matter",
    name: "New Matter",
    entityType: "matter",
    description: "Client intake through FICA, conflict clearance, risk classification and partner approval to an active matter.",
    steps: [
      { key: "client", label: "Client", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Client record captured with FICA documents uploaded." },
      { key: "fica", label: "FICA Compliance", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Client must not be compliance-blocked; FICA documents verified. A blocked client freezes matter approval (FICA_BLOCKED)." },
      { key: "conflict_check", label: "Conflict Check", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "A conflict scan must exist for the matter; matters cannot be approved without one (CONFLICT_CHECK_REQUIRED)." },
      { key: "risk_classification", label: "Risk Classification", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "Scan severity classifies risk; compliance_blocked risk freezes all lifecycle movement." },
      { key: "partner_review", label: "Partner Review", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Flagged conflicts must be reviewed by a partner; pending or rejected reviews block approval (CONFLICT_REVIEW_PENDING / CONFLICT_REJECTED)." },
      { key: "approval", label: "Approval", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Matter may only move to approved when conflict cleared/approved AND client FICA-compliant." },
      { key: "matter_creation", label: "Matter Active", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "Approved matter activated for work." },
    ],
  },
  {
    key: "document",
    name: "Document",
    entityType: "document",
    description: "Draft through AI assistance, review, partner approval and client signing to archive.",
    steps: [
      { key: "draft", label: "Draft", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "Document drafted against a matter." },
      { key: "ai_assist", label: "AI Assist", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "AI output carries provenance metadata; high-risk output cannot skip review." },
      { key: "review", label: "Review", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "Attorney review complete; forward movement only via submit-for-approval." },
      { key: "partner_approval", label: "Partner Approval", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Partner decision required; rejection or change-request returns document to draft. Direct approval endpoints are disabled." },
      { key: "client_signing", label: "Client Signing", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Only partner-approved documents can be sent for signature." },
      { key: "archived", label: "Archive", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Only signed documents can be archived." },
    ],
  },
  {
    key: "billing",
    name: "Billing",
    entityType: "invoice",
    description: "Time capture through billing review and invoice generation to a sent, paid invoice.",
    steps: [
      { key: "time_entry", label: "Time Entry", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Unbilled time recorded against the matter." },
      { key: "invoice_generation", label: "Invoice Generation", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Draft invoice generated from unbilled time (entries locked as billed atomically)." },
      { key: "billing_review", label: "Billing Review", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Partner-level billing review required; rejection (with note) returns invoice to draft. Invoices cannot be sent without approval (REVIEW_REQUIRED)." },
      { key: "invoice_sent", label: "Invoice Sent", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Only review-approved invoices can be sent; then marked paid." },
    ],
  },
  {
    key: "knowledge",
    name: "Knowledge Base",
    entityType: "knowledge",
    description: "Upload through categorisation and partner approval to AI-indexed availability.",
    steps: [
      { key: "upload", label: "Upload", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Content uploaded with type, category and tags." },
      { key: "categorise", label: "Categorise", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Governed fields set; any later edit of an approved item snapshots a version and re-enters review." },
      { key: "partner_review", label: "Partner Review", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Partner decision required; rejection needs a note (NOTE_REQUIRED)." },
      { key: "approve", label: "Approve", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Approval triggers AI indexing; only approved content may be indexed." },
      { key: "ai_index", label: "AI Index", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Only approved AND indexed content is retrievable by the AI (availableToAi)." },
    ],
  },
  {
    key: "signature",
    name: "Signature",
    entityType: "document",
    description: "Final approved document through client signature to certified storage in the matter.",
    steps: [
      { key: "final_document", label: "Final Document", responsibleRoles: PARTNERS, requiresApproval: true, blockingCondition: "Document must be partner-approved and in the signing stage (NOT_APPROVED)." },
      { key: "send_signature", label: "Send for Signature", responsibleRoles: ATTORNEYS, requiresApproval: false, blockingCondition: "Signature request may only be sent once (SIGNATURE_STATE)." },
      { key: "client_signature", label: "Client Signature", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Client signs; only sent documents can be marked signed." },
      { key: "certificate", label: "Certificate", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Signing timestamp recorded and audited as the signature certificate." },
      { key: "stored", label: "Stored in Matter", responsibleRoles: ANY_STAFF, requiresApproval: false, blockingCondition: "Signed document archived against the matter; immutable thereafter." },
    ],
  },
];

export interface WorkflowInstance {
  workflowKey: string;
  entityType: string;
  entityId: number;
  title: string;
  subtitle: string | null;
  currentStep: string;
  currentStepLabel: string;
  previousStep: string | null;
  nextStep: string | null;
  stepIndex: number; // 0-based index into definition steps
  totalSteps: number;
  responsibleRoles: string[];
  requiresApproval: boolean;
  status: string; // underlying entity status
  blockedBy: string | null; // active blocking condition, if any
  dueDate: string | null;
  link: string;
}

export function defOf(key: string): WorkflowDef {
  const def = WORKFLOW_DEFINITIONS.find((d) => d.key === key);
  if (!def) throw new Error(`Unknown workflow: ${key}`);
  return def;
}

/** Build an instance record from a definition + resolved step index. */
export function makeInstance(
  workflowKey: string,
  stepIndex: number,
  fields: Pick<WorkflowInstance, "entityId" | "title" | "subtitle" | "status" | "blockedBy" | "dueDate" | "link">,
): WorkflowInstance {
  const def = defOf(workflowKey);
  const i = Math.max(0, Math.min(stepIndex, def.steps.length - 1));
  const step = def.steps[i];
  return {
    workflowKey,
    entityType: def.entityType,
    ...fields,
    currentStep: step.key,
    currentStepLabel: step.label,
    previousStep: i > 0 ? def.steps[i - 1].key : null,
    nextStep: i < def.steps.length - 1 ? def.steps[i + 1].key : null,
    stepIndex: i,
    totalSteps: def.steps.length,
    responsibleRoles: step.responsibleRoles,
    requiresApproval: step.requiresApproval,
  };
}
