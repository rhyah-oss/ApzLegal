export type ChunkingStrategy = "legal_aware" | "fixed" | "paragraph";

export interface ChunkMetadata {
  page?: number;
  section?: string;
  clause?: string;
  sourceType: "matter_document" | "email" | "knowledge" | "template" | "precedent";
  sourceId?: number;
  knowledgeItemId?: number;
  templateId?: number;
  documentType?: string;
  documentSubtype?: string;
  practiceArea?: string;
  jurisdiction?: string;
  approvalStatus?: string;
  mimeType?: string;
  authorId?: number;
  matterId?: number;
  category?: string;
  approvedById?: number;
  approvedAt?: string;
  version?: number;
  chunkingStrategy: ChunkingStrategy;
  tokenCount?: number;
}

export interface Chunk {
  text: string;
  metadata: ChunkMetadata;
}

const MAX_CHUNK_SIZE = 1200;
const OVERLAP_SIZE = 200;
const MIN_CHUNK_SIZE = 100;

function splitByParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length >= MIN_CHUNK_SIZE);
}

function splitBySentences(text: string, maxSize: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).length > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = sentence.trim();
    } else {
      current = (current + " " + sentence).trim();
    }
  }
  if (current.trim().length >= MIN_CHUNK_SIZE) chunks.push(current.trim());
  return chunks;
}

function detectLegalHeadings(text: string): { heading: string; start: number }[] {
  const headingRegex = /^(?:\d+\.\s*|[A-Z][A-Z\s]+:|SECTION\s+\d+|CLAUSE\s+\d+|SCHEDULE\s+\d+|DEFINITIONS|PREAMBLE|RECITAL)/gm;
  const matches: { heading: string; start: number }[] = [];
  let m;
  while ((m = headingRegex.exec(text)) !== null) {
    matches.push({ heading: m[0].trim(), start: m.index });
  }
  return matches;
}

export function chunkText(
  text: string,
  metadata: Omit<ChunkMetadata, "chunkingStrategy" | "tokenCount">,
  strategy: ChunkingStrategy = "legal_aware"
): Chunk[] {
  if (!text || text.trim().length === 0) return [];
  const chunks: Chunk[] = [];

  if (strategy === "legal_aware") {
    const headings = detectLegalHeadings(text);
    const sections: { heading: string; text: string }[] = [];
    if (headings.length > 0) {
      for (let i = 0; i < headings.length; i++) {
        const start = headings[i].start;
        const end = i + 1 < headings.length ? headings[i + 1].start : text.length;
        sections.push({ heading: headings[i].heading, text: text.slice(start, end).trim() });
      }
    } else {
      sections.push({ heading: "", text });
    }

    for (const section of sections) {
      const paragraphs = splitByParagraphs(section.text);
      let buffer = section.heading ? `${section.heading}\n\n${paragraphs[0]}` : paragraphs[0] || "";
      let currentHeading = section.heading;
      let currentSection = section.heading;

      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        if (i === 0 && section.heading) continue;

        if (buffer.length + para.length + 1 > MAX_CHUNK_SIZE && buffer.length > MIN_CHUNK_SIZE) {
          chunks.push({
            text: buffer.trim(),
            metadata: { ...metadata, section: currentSection, chunkingStrategy: "legal_aware", tokenCount: Math.ceil(buffer.length / 4) },
          });
          const overlap = buffer.slice(-OVERLAP_SIZE);
          buffer = overlap + "\n\n" + para;
        } else {
          buffer = buffer + "\n\n" + para;
        }
      }
      if (buffer.trim().length >= MIN_CHUNK_SIZE) {
        chunks.push({
          text: buffer.trim(),
          metadata: { ...metadata, section: currentSection, chunkingStrategy: "legal_aware", tokenCount: Math.ceil(buffer.length / 4) },
        });
      }
    }
  } else if (strategy === "paragraph") {
    const paragraphs = splitByParagraphs(text);
    let buffer = paragraphs[0] || "";
    for (let i = 1; i < paragraphs.length; i++) {
      if (buffer.length + paragraphs[i].length + 1 > MAX_CHUNK_SIZE && buffer.length > MIN_CHUNK_SIZE) {
        chunks.push({
          text: buffer.trim(),
          metadata: { ...metadata, chunkingStrategy: "paragraph", tokenCount: Math.ceil(buffer.length / 4) },
        });
        buffer = buffer.slice(-OVERLAP_SIZE) + "\n\n" + paragraphs[i];
      } else {
        buffer = buffer + "\n\n" + paragraphs[i];
      }
    }
    if (buffer.trim().length >= MIN_CHUNK_SIZE) {
      chunks.push({
        text: buffer.trim(),
        metadata: { ...metadata, chunkingStrategy: "paragraph", tokenCount: Math.ceil(buffer.length / 4) },
      });
    }
  } else {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let buffer = sentences[0] || "";
    for (let i = 1; i < sentences.length; i++) {
      if (buffer.length + sentences[i].length > MAX_CHUNK_SIZE && buffer.length > MIN_CHUNK_SIZE) {
        chunks.push({
          text: buffer.trim(),
          metadata: { ...metadata, chunkingStrategy: "fixed", tokenCount: Math.ceil(buffer.length / 4) },
        });
        buffer = buffer.slice(-OVERLAP_SIZE) + " " + sentences[i];
      } else {
        buffer = buffer + " " + sentences[i];
      }
    }
    if (buffer.trim().length >= MIN_CHUNK_SIZE) {
      chunks.push({
        text: buffer.trim(),
        metadata: { ...metadata, chunkingStrategy: "fixed", tokenCount: Math.ceil(buffer.length / 4) },
      });
    }
  }

  return chunks.filter(c => c.text.trim().length >= MIN_CHUNK_SIZE);
}

export { MAX_CHUNK_SIZE, OVERLAP_SIZE, MIN_CHUNK_SIZE };
