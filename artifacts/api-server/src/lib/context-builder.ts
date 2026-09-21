import { RetrievedChunk } from "./retrieval-service";

export interface BuiltContext {
  matterContext: string;
  knowledgeContext: string;
  templateContext: string;
  emailContext: string;
  sourceSummary: Array<{ type: string; id: number; title?: string; chunkCount: number }>;
  totalChunks: number;
}

export function buildContextFromChunks(chunks: RetrievedChunk[], matterTitle?: string): BuiltContext {
  const matterChunks = chunks.filter(c => c.sourceType === "matter_document" || c.sourceType === "email");
  const knowledgeChunks = chunks.filter(c => c.sourceType === "knowledge" || c.sourceType === "guidance" || c.sourceType === "opinion");
  const templateChunks = chunks.filter(c => c.sourceType === "template" || c.sourceType === "precedent");
  const emailChunks = chunks.filter(c => c.sourceType === "email");

  const matterContext = formatChunks(matterChunks, "MATTER DOCUMENTS");
  const knowledgeContext = formatChunks(knowledgeChunks, "FIRM KNOWLEDGE BASE");
  const templateContext = formatChunks(templateChunks, "APPROVED TEMPLATES / PRECEDENTS");
  const emailContext = formatChunks(emailChunks, "AUTHORISED EMAIL CORRESPONDENCE");

  const sourceSummary = [
    ...matterChunks.map(c => ({ type: c.sourceType, id: c.sourceId || c.id, chunkCount: 1 })),
    ...knowledgeChunks.map(c => ({ type: c.sourceType, id: c.sourceId || c.id, chunkCount: 1 })),
    ...templateChunks.map(c => ({ type: c.sourceType, id: c.sourceId || c.id, chunkCount: 1 })),
    ...emailChunks.map(c => ({ type: c.sourceType, id: c.sourceId || c.id, chunkCount: 1 })),
  ];

  return {
    matterContext,
    knowledgeContext,
    templateContext,
    emailContext,
    sourceSummary,
    totalChunks: chunks.length,
  };
}

function formatChunks(chunks: RetrievedChunk[], header: string): string {
  if (chunks.length === 0) return "";
  const lines: string[] = [`${header} (${chunks.length} chunk(s) retrieved):`];
  for (const chunk of chunks) {
    lines.push(`\n--- ${chunk.citation} ---\n${chunk.text}`);
  }
  return lines.join("\n");
}

export function buildResearchContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  const lines: string[] = ["INTERNAL FIRM MATERIALS RETRIEVED:"];
  for (const chunk of chunks) {
    lines.push(`\n--- ${chunk.citation} ---\n${chunk.text}`);
  }
  return lines.join("\n");
}
