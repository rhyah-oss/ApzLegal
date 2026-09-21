import { db, documentsTable, knowledgeItemsTable, documentChunksTable, knowledgeChunksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { chunkText, type ChunkingStrategy } from "./chunking-service";
import { generateEmbeddingsBatch } from "./embedding-service";

export interface DocumentIndexingResult {
  documentId: number;
  chunksCreated: number;
  chunksIndexed: number;
  status: "indexed" | "failed" | "partial";
  error?: string;
}

export interface KnowledgeIndexingResult {
  knowledgeItemId: number;
  chunksCreated: number;
  chunksIndexed: number;
  status: "indexed" | "failed" | "partial";
  error?: string;
}

export async function indexDocument(
  documentId: number,
  extractedText: string,
  mimeType: string,
  metadata: {
    matterId: number;
    documentType?: string;
    practiceArea?: string;
    jurisdiction?: string;
    approvalStatus?: string;
    authorId?: number;
  },
  strategy: ChunkingStrategy = "legal_aware"
): Promise<DocumentIndexingResult> {
  try {
    const chunks = chunkText(extractedText, {
      sourceType: "matter_document",
      sourceId: documentId,
      matterId: metadata.matterId,
      documentType: metadata.documentType,
      practiceArea: metadata.practiceArea,
      jurisdiction: metadata.jurisdiction,
      approvalStatus: metadata.approvalStatus,
      mimeType,
      authorId: metadata.authorId,
    }, strategy);

    if (chunks.length === 0) {
      return { documentId, chunksCreated: 0, chunksIndexed: 0, status: "failed", error: "No chunks generated" };
    }

    await db.delete(documentChunksTable).where(eq(documentChunksTable.documentId, documentId));

    const texts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(texts);

    const rows = chunks.map((chunk, i) => ({
      documentId,
      matterId: metadata.matterId,
      chunkIndex: i,
      text: chunk.text,
      embedding: embeddings[i] ?? undefined,
      metadata: chunk.metadata,
      indexingStatus: embeddings[i] ? "indexed" : "failed",
      indexingError: embeddings[i] ? undefined : "Embedding generation failed",
      indexedAt: embeddings[i] ? new Date() : undefined,
    }));

    const inserted: any[] = await db.insert(documentChunksTable).values(rows as any).returning();
    const indexed = inserted.filter((r: any) => r.indexingStatus === "indexed").length;

    return {
      documentId,
      chunksCreated: chunks.length,
      chunksIndexed: indexed,
      status: indexed === chunks.length ? "indexed" : indexed > 0 ? "partial" : "failed",
      error: indexed === 0 ? "All embeddings failed" : undefined,
    };
  } catch (error: any) {
    return { documentId, chunksCreated: 0, chunksIndexed: 0, status: "failed", error: error.message };
  }
}

export async function indexKnowledgeItem(
  knowledgeItemId: number,
  content: string,
  metadata: {
    type: string;
    category?: string;
    practiceArea?: string;
    jurisdiction?: string;
    documentType?: string;
    documentSubtype?: string;
    authorId?: number;
    approvedById?: number;
    approvedAt?: string;
    version?: number;
  },
  strategy: ChunkingStrategy = "legal_aware"
): Promise<KnowledgeIndexingResult> {
  try {
    const chunks = chunkText(content, {
      sourceType: metadata.type as any,
      knowledgeItemId,
      category: metadata.category,
      practiceArea: metadata.practiceArea,
      jurisdiction: metadata.jurisdiction,
      documentType: metadata.documentType,
      documentSubtype: metadata.documentSubtype,
      authorId: metadata.authorId,
      approvedById: metadata.approvedById,
      approvedAt: metadata.approvedAt,
      version: metadata.version,
    }, strategy);

    if (chunks.length === 0) {
      return { knowledgeItemId, chunksCreated: 0, chunksIndexed: 0, status: "failed", error: "No chunks generated" };
    }

    await db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.knowledgeItemId, knowledgeItemId));

    const texts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddingsBatch(texts);

    const rows = chunks.map((chunk, i) => ({
      knowledgeItemId,
      chunkIndex: i,
      text: chunk.text,
      embedding: embeddings[i] ?? undefined,
      metadata: chunk.metadata,
      indexingStatus: embeddings[i] ? "indexed" : "failed",
      indexingError: embeddings[i] ? undefined : "Embedding generation failed",
      indexedAt: embeddings[i] ? new Date() : undefined,
    }));

    const inserted: any[] = await db.insert(knowledgeChunksTable).values(rows as any).returning();
    const indexed = inserted.filter((r: any) => r.indexingStatus === "indexed").length;

    return {
      knowledgeItemId,
      chunksCreated: chunks.length,
      chunksIndexed: indexed,
      status: indexed === chunks.length ? "indexed" : indexed > 0 ? "partial" : "failed",
      error: indexed === 0 ? "All embeddings failed" : undefined,
    };
  } catch (error: any) {
    return { knowledgeItemId, chunksCreated: 0, chunksIndexed: 0, status: "failed", error: error.message };
  }
}

export async function reindexDocument(documentId: number): Promise<DocumentIndexingResult | null> {
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
  if (!doc || !doc.content) return null;
  return indexDocument(documentId, doc.content, doc.mimeType || "text/plain", {
    matterId: doc.matterId,
    documentType: doc.documentType,
    authorId: doc.createdById == null ? undefined : doc.createdById,
  });
}

export async function reindexKnowledgeItem(knowledgeItemId: number): Promise<KnowledgeIndexingResult | null> {
  const [item] = await db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, knowledgeItemId));
  if (!item || !item.content) return null;
  return indexKnowledgeItem(knowledgeItemId, item.content, {
    type: item.type,
    category: item.category ?? undefined,
    practiceArea: item.practiceArea ?? undefined,
    jurisdiction: item.jurisdiction ?? undefined,
    documentType: item.documentType ?? undefined,
    documentSubtype: item.documentSubtype ?? undefined,
    authorId: item.authorId ?? undefined,
    approvedById: item.approvedById == null ? undefined : item.approvedById,
    approvedAt: item.approvedAt?.toISOString(),
    version: item.version ?? undefined,
  });
}
