import { db } from "@workspace/db";
import { documentChunksTable, knowledgeChunksTable } from "@workspace/db";
import { eq, sql, type SQL } from "drizzle-orm";
import { generateEmbedding, EmbeddingError } from "./embedding-service";

export interface VectorSearchResult {
  id: number;
  text: string;
  similarity: number;
  metadata: Record<string, any>;
  sourceType: string;
  sourceId?: number;
  matterId?: number;
}

export class VectorStoreError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "VectorStoreError";
  }
}

export async function searchDocumentChunks(
  matterId: number,
  queryEmbedding: number[],
  topK: number = 10,
  similarityThreshold: number = 0.3,
  filters?: {
    documentType?: string;
    practiceArea?: string;
    sourceType?: string;
  }
): Promise<VectorSearchResult[]> {
  try {
    const embeddingParam = JSON.stringify(queryEmbedding);
    const query = sql`
      SELECT
        id,
        text,
        metadata,
        matter_id as "matterId",
        1 - (embedding <=> ${embeddingParam}::vector) AS similarity
      FROM document_chunks
      WHERE matter_id = ${matterId}
        AND indexing_status = 'indexed'
        AND 1 - (embedding <=> ${embeddingParam}::vector) > ${similarityThreshold}
      ORDER BY embedding <=> ${embeddingParam}::vector
      LIMIT ${topK}
    `;
    const results = await db.execute(query);
    return (results.rows || []).map((r: any) => ({
      id: r.id,
      text: r.text,
      similarity: parseFloat(r.similarity),
      metadata: r.metadata || {},
      sourceType: r.metadata?.sourceType || "matter_document",
      sourceId: r.metadata?.sourceId,
      matterId: r.matterId,
    }));
  } catch {
    return [];
  }
}

export async function searchKnowledgeChunks(
  queryEmbedding: number[],
  topK: number = 10,
  similarityThreshold: number = 0.3,
  filters?: {
    type?: string;
    category?: string;
    practiceArea?: string;
    jurisdiction?: string;
    includeTemplates?: boolean;
    currentTemplatesOnly?: boolean;
    documentSubtype?: string;
  }
): Promise<VectorSearchResult[]> {
  try {
    const embeddingParam = JSON.stringify(queryEmbedding);
    let query: any;

    const subtypeFilter = filters?.documentSubtype ? sql`AND ki.document_subtype = ${filters.documentSubtype}` : sql``;

    if (filters?.includeTemplates && filters?.currentTemplatesOnly) {
      query = sql`
        SELECT
          kc.id,
          kc.text,
          kc.metadata,
          ki.document_subtype,
          1 - (kc.embedding <=> ${embeddingParam}::vector) AS similarity
        FROM knowledge_chunks kc
        INNER JOIN knowledge_items ki ON ki.id = kc.knowledge_item_id
        WHERE kc.indexing_status = 'indexed'
          AND ki.status = 'approved'
          AND ki.type = 'template'
          AND ki.review_date IS NOT NULL
          AND ki.review_date >= CURRENT_DATE
          ${subtypeFilter}
          AND 1 - (kc.embedding <=> ${embeddingParam}::vector) > ${similarityThreshold}
        ORDER BY kc.embedding <=> ${embeddingParam}::vector
        LIMIT ${topK}
      `;
    } else if (filters?.includeTemplates) {
      query = sql`
        SELECT
          kc.id,
          kc.text,
          kc.metadata,
          ki.document_subtype,
          1 - (kc.embedding <=> ${embeddingParam}::vector) AS similarity
        FROM knowledge_chunks kc
        INNER JOIN knowledge_items ki ON ki.id = kc.knowledge_item_id
        WHERE kc.indexing_status = 'indexed'
          AND ki.status = 'approved'
          AND ki.type = 'template'
          ${subtypeFilter}
          AND 1 - (kc.embedding <=> ${embeddingParam}::vector) > ${similarityThreshold}
        ORDER BY kc.embedding <=> ${embeddingParam}::vector
        LIMIT ${topK}
      `;
    } else {
      query = sql`
        SELECT
          id,
          text,
          metadata,
          1 - (embedding <=> ${embeddingParam}::vector) AS similarity
        FROM knowledge_chunks
        WHERE indexing_status = 'indexed'
          AND 1 - (embedding <=> ${embeddingParam}::vector) > ${similarityThreshold}
        ORDER BY embedding <=> ${embeddingParam}::vector
        LIMIT ${topK}
      `;
    }
    const results = await db.execute(query);
    return (results.rows || []).map((r: any) => ({
      id: r.id,
      text: r.text,
      similarity: parseFloat(r.similarity),
      metadata: {
        ...(r.metadata || {}),
        ...(r.document_subtype ? { documentSubtype: r.document_subtype } : {})
      },
      sourceType: r.metadata?.sourceType || "knowledge",
      sourceId: r.metadata?.knowledgeItemId,
      matterId: r.metadata?.matterId,
    }));
  } catch {
    return [];
  }
}

export async function semanticSearch(
  query: string,
  options: {
    matterId?: number;
    topK?: number;
    similarityThreshold?: number;
    filters?: any;
    includeKnowledge?: boolean;
    includeTemplates?: boolean;
    currentTemplatesOnly?: boolean;
    documentSubtype?: string;
  } = {}
): Promise<VectorSearchResult[]> {
  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch (err) {
    if (err instanceof EmbeddingError) {
      throw new VectorStoreError("Embedding generation failed", err);
    }
    throw new VectorStoreError("Embedding generation failed", err as Error);
  }

  const topK = options.topK || 10;
  const threshold = options.similarityThreshold || 0.3;

  const results: VectorSearchResult[] = [];

  if (options.matterId) {
    const matterChunks = await searchDocumentChunks(options.matterId, embedding, topK, threshold, options.filters);
    results.push(...matterChunks);
  }

  if (options.includeKnowledge !== false) {
    const knowledgeChunks = await searchKnowledgeChunks(embedding, topK, threshold, {
      ...options.filters,
      includeTemplates: options.includeTemplates,
      currentTemplatesOnly: options.currentTemplatesOnly,
      documentSubtype: options.documentSubtype,
    });
    results.push(...knowledgeChunks);
  }

  results.sort((a, b) => b.similarity - a.similarity);

  const seen = new Set<string>();
  const deduplicated: VectorSearchResult[] = [];
  for (const r of results) {
    const key = `${r.sourceType}-${r.sourceId}-${r.text.slice(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(r);
    }
  }

  return deduplicated.slice(0, topK);
}
