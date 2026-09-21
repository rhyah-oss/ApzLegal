import OpenAI from "openai";

export type AIProvider = "ollama" | "openai";

export interface AIClientConfig {
  provider: AIProvider;
  model: string;
  transcriptionModel: string | null;
  client: OpenAI | null;
}

const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";

function createOllamaClient(): OpenAI | null {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (!baseUrl) return null;
  const timeoutMs = Number.parseInt(String(process.env.AI_REQUEST_TIMEOUT_MS ?? "300000"), 10);
  return new OpenAI({
    baseURL: `${baseUrl.replace(/\/$/, "")}/v1`,
    apiKey: "ollama",
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000,
  });
}

function createOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const timeoutMs = Number.parseInt(String(process.env.AI_REQUEST_TIMEOUT_MS ?? "300000"), 10);
  return new OpenAI({
    apiKey,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000,
  });
}

export function createAIClient(): AIClientConfig {
  const provider = (process.env.AI_PROVIDER as AIProvider) || "ollama";

  if (provider === "ollama") {
    const client = createOllamaClient();
    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    return {
      provider: "ollama",
      model,
      transcriptionModel: null,
      client,
    };
  }

  const client = createOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
  return {
    provider: "openai",
    model,
    transcriptionModel,
    client,
  };
}

export const aiConfig = createAIClient();
export { OLLAMA_EMBEDDING_MODEL };
