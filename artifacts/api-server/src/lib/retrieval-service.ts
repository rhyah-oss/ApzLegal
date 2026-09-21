import { db } from "@workspace/db";
import { semanticSearch, type VectorSearchResult, VectorStoreError } from "./vector-store";
import { getCurrentUser } from "./context";

export type DocumentSubtype = "nda" | "partnership" | "employment" | "service" | "generic" | null;

export class RetrievalError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "RetrievalError";
  }
}

export function normalizeDocumentSubtype(instructions: string, workflow: string): DocumentSubtype {
  const lower = instructions.toLowerCase();
  
  if (lower.includes("nda") || lower.includes("non-disclosure") || lower.includes("confidentiality agreement")) {
    return "nda";
  }
  if (lower.includes("partnership agreement") || lower.includes("partnership deed")) {
    return "partnership";
  }
  if (lower.includes("employment agreement") || lower.includes("employment contract") || lower.includes("service agreement") && lower.includes("employ")) {
    return "employment";
  }
  if (lower.includes("service agreement") || lower.includes("services agreement") || lower.includes("msa") || lower.includes("master services")) {
    return "service";
  }
  if (workflow === "draft_contract" && (lower.includes("contract") || lower.includes("agreement"))) {
    return "generic";
  }
  return null;
}

export interface RetrievalOptions {
  matterId?: number;
  query: string;
  topK?: number;
  similarityThreshold?: number;
  includeDocuments?: boolean;
  includeKnowledge?: boolean;
  includeEmails?: boolean;
  includeTemplates?: boolean;
  filters?: {
    documentType?: string;
    practiceArea?: string;
    category?: string;
  };
}

export interface RetrievedChunk {
  id: number;
  text: string;
  similarity: number;
  sourceType: string;
  sourceId?: number;
  matterId?: number;
  metadata: Record<string, any>;
  citation: string;
}

export async function retrieveForAiGenerate(req: any, options: RetrievalOptions): Promise<RetrievedChunk[]> {
  const user = await getCurrentUser(req);
  if (!user) return [];

  const topK = options.topK || 8;
  const threshold = options.similarityThreshold || 0.25;

  const results: RetrievedChunk[] = [];

  if (options.matterId && options.includeDocuments !== false) {
    try {
      const matterDocs = await semanticSearch(options.query, {
        matterId: options.matterId,
        topK: Math.ceil(topK * 0.6),
        similarityThreshold: threshold,
        filters: options.filters,
        includeKnowledge: false, // Only retrieve matter documents, not knowledge
      });
      for (const doc of matterDocs) {
        results.push({
          ...doc,
          citation: formatDocumentCitation(doc, user.role),
        });
      }
    } catch (err) {
      if (err instanceof VectorStoreError) {
        console.error("Vector store error during matter document retrieval:", err.message);
      } else {
        console.error("Unexpected error during matter document retrieval:", err);
      }
    }
  }

  const isTemplateDrafting = options.filters?.documentType === "contract" && options.includeTemplates;
  const includeTemplates = options.includeTemplates !== false;
  const currentTemplatesOnly = isTemplateDrafting;
  
  // Normalize document subtype from instructions for template filtering
  const documentSubtype = normalizeDocumentSubtype(options.query, options.filters?.documentType || "");

  if (options.includeKnowledge !== false) {
    try {
      const knowledgeResults = await semanticSearch(options.query, {
        topK: Math.ceil(topK * 0.4),
        similarityThreshold: threshold,
        filters: options.filters ? { type: options.filters.documentType, category: options.filters.category } : undefined,
        includeKnowledge: true,
        includeTemplates,
        currentTemplatesOnly,
        documentSubtype,
      });
      for (const kb of knowledgeResults) {
        results.push({
          ...kb,
          citation: formatKnowledgeCitation(kb),
        });
      }
    } catch (err) {
      if (err instanceof VectorStoreError) {
        console.error("Vector store error during knowledge retrieval:", err.message);
      } else {
        console.error("Unexpected error during knowledge retrieval:", err);
      }
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

export async function retrieveForResearch(req: any, options: RetrievalOptions): Promise<RetrievedChunk[]> {
  const user = await getCurrentUser(req);
  if (!user) return [];

  const topK = options.topK || 10;
  const threshold = options.similarityThreshold || 0.2;

  const results: RetrievedChunk[] = [];

  if (options.matterId && options.includeDocuments !== false) {
    try {
      const matterDocs = await semanticSearch(options.query, {
        matterId: options.matterId,
        topK: Math.ceil(topK * 0.5),
        similarityThreshold: threshold,
        filters: options.filters,
      });
      for (const doc of matterDocs) {
        results.push({
          ...doc,
          citation: formatDocumentCitation(doc, user.role),
        });
      }
    } catch (err) {
      if (err instanceof VectorStoreError) {
        console.error("Vector store error during matter document retrieval:", err.message);
      } else {
        console.error("Unexpected error during matter document retrieval:", err);
      }
    }
  }

  if (options.includeKnowledge !== false) {
    try {
      const knowledgeResults = await semanticSearch(options.query, {
        topK: Math.ceil(topK * 0.5),
        similarityThreshold: threshold,
        filters: options.filters ? { category: options.filters.category } : undefined,
        includeKnowledge: true,
      });
      for (const kb of knowledgeResults) {
        results.push({
          ...kb,
          citation: formatKnowledgeCitation(kb),
        });
      }
    } catch (err) {
      if (err instanceof VectorStoreError) {
        console.error("Vector store error during knowledge retrieval:", err.message);
      } else {
        console.error("Unexpected error during knowledge retrieval:", err);
      }
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

function formatDocumentCitation(chunk: VectorSearchResult, userRole: string): string {
  const parts = [`[Doc #${chunk.sourceId || chunk.id}`];
  if (chunk.metadata?.documentType) parts.push(`type=${chunk.metadata.documentType}`);
  if (chunk.metadata?.section) parts.push(`section="${chunk.metadata.section}"`);
  if (chunk.metadata?.page) parts.push(`p.${chunk.metadata.page}`);
  parts.push(`sim=${(chunk.similarity * 100).toFixed(0)}%`);
  parts.push("]");
  return parts.join(" ");
}

function formatKnowledgeCitation(chunk: VectorSearchResult): string {
  const parts = [`[KB #${chunk.sourceId || chunk.id}`];
  if (chunk.metadata?.category) parts.push(`cat=${chunk.metadata.category}`);
  if (chunk.metadata?.knowledgeItemType) parts.push(`type=${chunk.metadata.knowledgeItemType}`);
  if (chunk.metadata?.documentSubtype) parts.push(`subtype=${chunk.metadata.documentSubtype}`);
  if (chunk.metadata?.section) parts.push(`section="${chunk.metadata.section}"`);
  parts.push(`sim=${(chunk.similarity * 100).toFixed(0)}%`);
  parts.push("]");
  return parts.join(" ");
}
