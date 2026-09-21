import OpenAI from "openai";
import { aiConfig } from "./ai-client";

const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_TIMEOUT_MS = Number.parseInt(String(process.env.EMBEDDING_REQUEST_TIMEOUT_MS ?? "120000"), 10);

export class EmbeddingError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "EmbeddingError";
  }
}

let embeddingClient: OpenAI | null = null;

export function getEmbeddingClient(): OpenAI | null {
  if (embeddingClient) return embeddingClient;
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (!baseUrl) return null;
  const timeoutMs = Number.isFinite(EMBEDDING_TIMEOUT_MS) && EMBEDDING_TIMEOUT_MS > 0 ? EMBEDDING_TIMEOUT_MS : 120000;
  embeddingClient = new OpenAI({
    baseURL: `${baseUrl.replace(/\/$/, "")}/v1`,
    apiKey: "ollama",
    timeout: timeoutMs,
  });
  return embeddingClient;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getEmbeddingClient();
  if (!client) throw new EmbeddingError("Embedding client not configured: OLLAMA_BASE_URL not set");
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(`Invalid embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding?.length ?? "null"}`);
    }
    return embedding;
  } catch (err) {
    if (err instanceof EmbeddingError) throw err;
    throw new EmbeddingError("Embedding generation failed", err as Error);
  }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const client = getEmbeddingClient();
  if (!client) throw new EmbeddingError("Embedding client not configured: OLLAMA_BASE_URL not set");
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map(t => t.slice(0, 8000)),
    });
    return response.data.map(d => {
      if (!d.embedding || d.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingError(`Invalid embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${d.embedding?.length ?? "null"}`);
      }
      return d.embedding;
    });
  } catch (err) {
    if (err instanceof EmbeddingError) throw err;
    throw new EmbeddingError("Batch embedding generation failed", err as Error);
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
