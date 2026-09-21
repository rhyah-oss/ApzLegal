import { RetrievedChunk } from "./retrieval-service";

export interface Citation {
  sourceType: string;
  sourceId: number;
  title?: string;
  section?: string;
  page?: number;
  similarity: number;
  chunkId: number;
}

export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map(chunk => ({
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId || chunk.id,
    title: chunk.metadata?.documentSubtype 
      ? `${chunk.metadata.documentType} (${chunk.metadata.documentSubtype})`
      : chunk.metadata?.documentType || chunk.metadata?.category || chunk.metadata?.section,
    section: chunk.metadata?.section || chunk.metadata?.clause,
    page: chunk.metadata?.page,
    similarity: chunk.similarity,
    chunkId: chunk.id,
  }));
}

export function formatCitationsForStorage(citations: Citation[]): string[] {
  return citations.map(c => {
    const parts = [c.sourceType];
    if (c.sourceId) parts.push(`#${c.sourceId}`);
    if (c.title) parts.push(`"${c.title}"`);
    if (c.section) parts.push(`§${c.section}`);
    if (c.page) parts.push(`p.${c.page}`);
    parts.push(`(${(c.similarity * 100).toFixed(0)}%)`);
    return parts.join(" ");
  });
}

export function buildSourceSummary(chunks: RetrievedChunk[]): string {
  const byType = new Map<string, number>();
  for (const c of chunks) {
    byType.set(c.sourceType, (byType.get(c.sourceType) || 0) + 1);
  }
  return Array.from(byType.entries()).map(([type, count]) => `${type}: ${count} chunk(s)`).join("; ");
}
