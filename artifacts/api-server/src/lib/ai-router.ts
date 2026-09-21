export type RetrievalMode = "matter_only" | "matter_plus_knowledge" | "knowledge_base" | "template_drafting" | "precedent_search" | "document_specific" | "general_legal" | "external_research";

export interface RetrievalDecision {
  mode: RetrievalMode;
  includeMatterDocuments: boolean;
  includeKnowledge: boolean;
  includeTemplates: boolean;
  includeEmails: boolean;
  includePrecedents: boolean;
  explanation: string;
}

const TEMPLATE_DRAFTING_KEYWORDS = ["draft", "prepare", "write", "create a", "compose", "generate a"];
const MATTER_SPECIFIC_KEYWORDS = ["this matter", "the client", "our case", "this case", "the agreement", "the contract"];
const KNOWLEDGE_KEYWORDS = ["policy", "procedure", "guideline", "protocol", "firm policy", "knowledge base"];
const PRECEDENT_KEYWORDS = ["precedent", "similar case", "previous matter", "past case"];

export function determineRetrievalMode(
  workflow: string,
  instructions: string,
  matterId?: number,
  hasApprovedTemplate: boolean = false
): RetrievalDecision {
  const lower = instructions.toLowerCase();

  if (workflow === "draft_contract" || workflow === "draft_email" || TEMPLATE_DRAFTING_KEYWORDS.some(k => lower.includes(k))) {
    if (hasApprovedTemplate) {
      return {
        mode: "template_drafting",
        includeMatterDocuments: true,
        includeKnowledge: true,
        includeTemplates: true,
        includeEmails: !!matterId,
        includePrecedents: true,
        explanation: "Drafting workflow with approved template available. Prioritising template structure + matter context + firm knowledge.",
      };
    }
    return {
      mode: "template_drafting",
      includeMatterDocuments: !!matterId,
      includeKnowledge: true,
      includeTemplates: false,
      includeEmails: !!matterId,
      includePrecedents: true,
      explanation: "Drafting workflow without approved template. Using matter context, firm knowledge, and precedents.",
    };
  }

  if (workflow === "analyse_clause" || workflow === "legal_research") {
    if (matterId) {
      return {
        mode: "matter_plus_knowledge",
        includeMatterDocuments: true,
        includeKnowledge: true,
        includeTemplates: false,
        includeEmails: !!matterId,
        includePrecedents: false,
        explanation: "Analysis/research workflow bound to matter. Retrieving matter documents and firm knowledge.",
      };
    }
    return {
      mode: "knowledge_base",
      includeMatterDocuments: false,
      includeKnowledge: true,
      includeTemplates: false,
      includeEmails: false,
      includePrecedents: false,
      explanation: "Analysis/research workflow without matter context. Retrieving firm knowledge only.",
    };
  }

  if (matterId) {
    return {
      mode: "matter_only",
      includeMatterDocuments: true,
      includeKnowledge: true,
      includeTemplates: false,
      includeEmails: !!matterId,
      includePrecedents: false,
      explanation: "Matter-bound workflow. Retrieving matter documents and relevant firm knowledge.",
    };
  }

  return {
    mode: "general_legal",
    includeMatterDocuments: false,
    includeKnowledge: false,
    includeTemplates: false,
    includeEmails: false,
    includePrecedents: false,
    explanation: "No matter context. No retrieval performed.",
  };
}
