import { Router, type IRouter } from "express";
import express from "express";
import {
  db, aiConversationsTable, usersTable, mattersTable, clientsTable, documentsTable, documentVersionsTable, retrievalLogsTable, knowledgeItemsTable,
} from "@workspace/db";
import { eq, and, desc, isNull, type SQL, sql } from "drizzle-orm";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getCurrentUser, logAudit } from "../lib/context";
import { AI_AUTHOR_ROLES, LEGAL_AUTHOR_ROLES, requireRole } from "../lib/permissions";
import { listMatterEmails } from "../lib/email-service";
import { aiConfig, type AIProvider } from "../lib/ai-client";
import { determineRetrievalMode, type RetrievalMode } from "../lib/ai-router";
import { retrieveForAiGenerate, type RetrievedChunk, normalizeDocumentSubtype } from "../lib/retrieval-service";
import { VectorStoreError } from "../lib/vector-store";
import { RetrievalError } from "../lib/retrieval-service";
import { buildContextFromChunks } from "../lib/context-builder";
import { buildCitations, formatCitationsForStorage, buildSourceSummary } from "../lib/citation-service";
import { reindexDocument } from "../lib/indexing-service";

const router: IRouter = Router();

// ── Governed AI workflows ────────────────────────────────────────────────────
// Risk classification is fixed server-side per workflow (PRD AI Governance
// Framework). It can never be chosen by the client.
const AI_WORKFLOWS: Record<string, {
  label: string;
  risk: "low" | "medium" | "high";
  documentType: "contract" | "pleading" | "opinion" | "correspondence" | "affidavit" | "general";
  system: string;
}> = {
  draft_email: {
    label: "Draft Email",
    risk: "low",
    documentType: "correspondence",
    system: "You draft professional legal correspondence for a South African law firm. Produce a complete, well-structured email body ready for attorney review.",
  },
  summarise_matter: {
    label: "Summarise Matter",
    risk: "low",
    documentType: "general",
    system: "You summarise legal matters for a South African law firm. Produce a concise, factual summary of the matter based only on the context provided. Do not speculate.",
  },
  matter_summary: {
    label: "Generate Matter Summary",
    risk: "low",
    documentType: "general",
    system: "You produce a formal matter summary report for a South African law firm, suitable for the client file: background, current status, key dates, outstanding items, next steps. Use only the context provided.",
  },
  draft_contract: {
    label: "Draft Contract",
    risk: "medium",
    documentType: "contract",
    system: "You draft contracts under South African law. Produce a complete draft with numbered clauses. Flag any clause that requires attorney judgement with [ATTORNEY REVIEW]. Include POPIA-compliant data clauses where personal information is processed.",
  },
  analyse_clause: {
    label: "Analyse Clause",
    risk: "medium",
    documentType: "general",
    system: "You analyse contract clauses under South African law: meaning, enforceability, risks, and recommended amendments. Be precise about uncertainty.",
  },
  legal_research: {
    label: "Legal Research",
    risk: "high",
    documentType: "opinion",
    system: "You perform legal research under South African law. Set out the legal position with statutory and case authority. This output informs — it is not a legal opinion until reviewed and adopted by an attorney. State the limits of your analysis explicitly.",
  },
};

const openaiClient = () => aiConfig.client;
const AI_MODEL = aiConfig.model;
const TRANSCRIPTION_MODEL = aiConfig.transcriptionModel;
const MAX_TRANSCRIPTION_BYTES = 10 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 30_000;
const AUDIO_MEDIA_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
]);
const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "application/octet-stream": "bin",
};

const parseAudioBody = express.raw({
  type: Array.from(AUDIO_MEDIA_TYPES),
  limit: `${MAX_TRANSCRIPTION_BYTES}b`,
});

async function requireUser(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return user;
}

async function auditAi(req: any, output: { id: number; title: string | null }, action: string, details: string, userId: number | null) {
  await logAudit({
    action,
    entityType: "ai_output",
    entityId: output.id,
    entityTitle: output.title ?? "AI output",
    userId,
    details,
    ipAddress: req.ip,
  });
}

async function buildMatterContext(matterId: number, user: Awaited<ReturnType<typeof getCurrentUser>>): Promise<string | null> {
  if (!user) return null;
  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, matterId));
  if (!matter) return null;
  const emails = await listMatterEmails(user, matterId, { limit: 20 });
  if (!emails) return null;
  const [client] = matter.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, matter.clientId))
    : [undefined];
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.matterId, matterId));
  const lines = [
    `Matter: ${matter.title} (ref ${matter.reference ?? matter.id})`,
    `Status: ${matter.status}; Practice area: ${matter.practiceArea ?? "unspecified"}; Risk level: ${matter.riskLevel ?? "unspecified"}`,
    client ? `Client: ${client.name}${client.type ? ` (${client.type})` : ""}` : "Client: not linked",
    matter.description ? `Description: ${matter.description}` : null,
    docs.length
      ? `Documents on file: ${docs.map((d) => `"${d.title}" (${d.documentType}, ${d.status}, v${d.version})`).join("; ")}`
      : "Documents on file: none",
    emails.length
      ? `Authorised email correspondence (cite as Email #id when relied upon):\n${emails.map((email) => `[Email #${email.id}] ${email.subject ?? "(no subject)"} — from ${email.senderEmail} — ${email.receivedAt.toISOString()}\n${(email.bodyText ?? "").slice(0, 2500)}`).join("\n\n")}`
      : "Authorised email correspondence: none",
  ].filter(Boolean);
  return lines.join("\n");
}

function enrichOutput(c: typeof aiConversationsTable.$inferSelect, users: Map<number, string>) {
  const wf = AI_WORKFLOWS[c.workflow];
  return {
    id: c.id,
    matterId: c.matterId,
    workflow: c.workflow,
    workflowLabel: wf?.label ?? c.workflow,
    title: c.title,
    params: c.params ?? null,
    query: c.query,
    response: c.response,
    model: c.model,
    explanation: c.explanation,
    riskLevel: c.riskLevel,
    confidenceScore: c.confidenceScore != null ? parseFloat(c.confidenceScore as string) : null,
    citations: c.citations ?? [],
    citationStatus: c.citationStatus,
    reviewStatus: c.reviewStatus,
    reviewNote: c.reviewNote,
    humanOverride: c.humanOverride,
    reviewedBy: c.reviewedById ? users.get(c.reviewedById) ?? null : null,
    reviewedAt: c.reviewedAt,
    requestedBy: c.userId ? users.get(c.userId) ?? null : null,
    documentId: c.documentId,
    requiresReview: c.riskLevel === "high" && c.reviewStatus === "pending",
    createdAt: c.createdAt,
    retrievalMode: (c.params as any)?.retrievalMode ?? null,
    sourcesUsed: (c.params as any)?.sourcesUsed ?? null,
    chunksRetrieved: (c.params as any)?.chunksRetrieved ?? 0,
  };
}

async function userMap() {
  const users = await db.select().from(usersTable);
  return new Map(users.map((u) => [u.id, u.name]));
}

// ── Generate ─────────────────────────────────────────────────────────────────

router.post("/ai/generate", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, AI_AUTHOR_ROLES, "Only attorneys and partners may generate governed AI work product.");
  if (!user) return;

  const { workflow, matterId, instructions, params } = req.body ?? {};
  const wf = AI_WORKFLOWS[String(workflow ?? "")];
  if (!wf) {
    res.status(400).json({ error: `Unknown workflow. Valid workflows: ${Object.keys(AI_WORKFLOWS).join(", ")}.`, code: "UNKNOWN_WORKFLOW" });
    return;
  }
  const mid = parseInt(String(matterId ?? ""), 10);
  if (isNaN(mid)) {
    res.status(400).json({ error: "AI workflows must run in the context of a matter. Provide matterId.", code: "MATTER_REQUIRED" });
    return;
  }
  const matterContext = await buildMatterContext(mid, user);
  if (!matterContext) { res.status(404).json({ error: "Matter not found" }); return; }

  // Check if there's an approved, current template available for this document type
  let hasApprovedTemplate = false;
  if (wf.documentType === "contract") {
    const documentSubtype = normalizeDocumentSubtype(String(instructions || ""), "contract");
    const whereConditions = [
      eq(knowledgeItemsTable.type, "template"),
      eq(knowledgeItemsTable.status, "approved"),
      eq(knowledgeItemsTable.documentType, "contract"),
      sql`${knowledgeItemsTable.reviewDate} IS NOT NULL AND ${knowledgeItemsTable.reviewDate} >= CURRENT_DATE`
    ];
    if (documentSubtype) {
      whereConditions.push(eq(knowledgeItemsTable.documentSubtype, documentSubtype));
    }
    const [templateCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeItemsTable)
      .where(and(...whereConditions));
    hasApprovedTemplate = (templateCount?.count ?? 0) > 0;
    
    // If drafting a contract and no approved template exists for the requested subtype, return a clear error
    if (!hasApprovedTemplate && workflow === "draft_contract") {
      const subtypeLabel = documentSubtype ? ` (${documentSubtype})` : "";
      res.status(404).json({ 
        error: `No approved firm template found for${subtypeLabel} contract drafting. Please ensure an approved template exists for this document type, or use a different workflow.`, 
        code: "NO_APPROVED_TEMPLATE",
        requestedSubtype: documentSubtype
      });
      return;
    }
  }

  const client = openaiClient();
  if (!client) {
    res.status(503).json({ error: "AI model is not configured.", code: "AI_UNAVAILABLE" });
    return;
  }

  const aiTimeoutMs = Number.parseInt(String(process.env.AI_REQUEST_TIMEOUT_MS ?? "300000"), 10);
  const controller = new AbortController();
  const aiTimeoutHandle = setTimeout(() => controller.abort(), Number.isFinite(aiTimeoutMs) && aiTimeoutMs > 0 ? aiTimeoutMs : 300000);

  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const paramLines = Object.entries(p)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);

  const retrievalMode = determineRetrievalMode(String(workflow), String(instructions || ""), mid, hasApprovedTemplate);
  const retrievedChunks: RetrievedChunk[] = [];
  let builtContext: ReturnType<typeof buildContextFromChunks> | null = null;

  let retrievalError: Error | null = null;
  let retrievalFailed = false;

  try {
    if (retrievalMode.includeMatterDocuments || retrievalMode.includeKnowledge || retrievalMode.includeTemplates) {
      // For template drafting workflows, ensure documentType is passed so currentTemplatesOnly filter works
      const filterDocumentType = p.documentType
        ? String(p.documentType)
        : retrievalMode.includeTemplates && wf.documentType
          ? wf.documentType
          : undefined;
      const chunks = await retrieveForAiGenerate(req, {
        matterId: mid,
        query: String(instructions || p.query || "matter context"),
        topK: 10,
        similarityThreshold: 0.25,
        includeDocuments: retrievalMode.includeMatterDocuments,
        includeKnowledge: retrievalMode.includeKnowledge,
        includeTemplates: retrievalMode.includeTemplates,
        includeEmails: retrievalMode.includeEmails,
        filters: filterDocumentType ? { documentType: filterDocumentType } : undefined,
      });
      retrievedChunks.push(...chunks);
      builtContext = buildContextFromChunks(retrievedChunks);
    }
  } catch (err: any) {
    retrievalError = err;
    retrievalFailed = true;
    if (err instanceof VectorStoreError || err instanceof RetrievalError) {
      console.error("RAG retrieval failed:", err.message);
    } else {
      console.error("Unexpected RAG retrieval error:", err);
    }
  }

  // If retrieval failed completely and we need sources for this workflow, return an error
  if (retrievalFailed && (retrievalMode.includeMatterDocuments || retrievalMode.includeKnowledge || retrievalMode.includeTemplates)) {
    res.status(503).json({ 
      error: "RAG retrieval unavailable. Please try again later.", 
      code: "RAG_RETRIEVAL_FAILED",
      details: retrievalError?.message ?? "Unknown retrieval error"
    });
    return;
  }

  const systemPrompt = `${wf.system}

CRITICAL SOURCE-GROUNDING RULES:
1. Answer ONLY from the retrieved authorised sources provided in the context below.
2. If the retrieved sources do not contain the answer, explicitly state: "The authorised matter sources do not contain information about [topic]." Do not guess or speculate.
3. Distinguish between firm documents/general knowledge. Never present general legal knowledge as if it came from the firm's documents.
4. Cite sources using the bracketed references provided in the context (e.g., [Doc #123 p.5], [KB #45 cat=contracts]).
5. Do not invent case names, legislation, citations, sections or authorities.
6. If an approved template was retrieved, clearly identify it and preserve its structure as the STRUCTURAL BASE. Do not reinvent the document from scratch.
7. ATTORNEY INSTRUCTIONS TAKE PRIORITY over template defaults. When instructions conflict with template provisions (e.g., different confidentiality period, different party names), you MUST:
   a) Follow the attorney's explicit instructions
   b) Clearly note the deviation from the template in your explanation
   c) Do not silently revert to template defaults
8. Confidence reflects whether the answer is supported by retrieved sources. Use lower confidence when relying on general knowledge.

Jurisdiction: South Africa unless the parameters specify otherwise.

Respond with a single JSON object:
{
  "title": short descriptive title for this output,
  "content": the full work product (markdown),
  "confidence": your honest confidence in the legal accuracy of this output as an integer 0-100, or null if you cannot meaningfully estimate it,
  "citations": array of specific statutes, regulations or case law you actually relied on (empty array if none — never invent authority),
  "explanation": 2-4 sentences explaining how you produced this output, what sources or reasoning you relied on, and its key limitations including any deviations from template provisions
}`;

  const contextBlocks = [
    `CURRENT MATTER FACTS:\n${matterContext}`,
    builtContext?.matterContext ? `\n\nRETRIEVED MATTER DOCUMENTS:\n${builtContext.matterContext}` : null,
    builtContext?.knowledgeContext ? `\n\nRETRIEVED FIRM KNOWLEDGE BASE:\n${builtContext.knowledgeContext}` : null,
    builtContext?.templateContext ? `\n\nRETRIEVED APPROVED TEMPLATES / PRECEDENTS:\n${builtContext.templateContext}` : null,
    builtContext?.emailContext ? `\n\nAUTHORISED EMAIL CORRESPONDENCE:\n${builtContext.emailContext}` : null,
    paramLines.length ? `\n\nWORKFLOW PARAMETERS:\n${paramLines.join("\n")}` : null,
    instructions ? `\n\nATTORNEY INSTRUCTIONS:\n${String(instructions)}` : null,
  ].filter(Boolean);

  const userPrompt = contextBlocks.join("\n");

  let parsedOut: { content: string; confidence: number | null; citations: string[]; explanation: string; title: string };
  try {
    const completion = await client.chat.completions.create(
      {
        model: AI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          { role: "user", content: userPrompt },
        ],
      },
      { signal: controller.signal },
    );
    clearTimeout(aiTimeoutHandle);
    const raw = completion.choices[0]?.message?.content ?? "";
    const j = JSON.parse(raw);
    parsedOut = {
      title: typeof j.title === "string" && j.title.trim() ? j.title.trim() : wf.label,
      content: typeof j.content === "string" ? j.content : raw,
      confidence: typeof j.confidence === "number" && j.confidence >= 0 && j.confidence <= 100 ? j.confidence : null,
      citations: Array.isArray(j.citations) ? j.citations.filter((c: unknown) => typeof c === "string") : [],
      explanation: typeof j.explanation === "string" ? j.explanation : "",
    };
  } catch (err: any) {
    clearTimeout(aiTimeoutHandle);
    const errMsg = [
      err?.message,
      err?.error?.message,
      err?.cause?.message,
      err?.cause?.error?.message,
      err?.statusMessage,
    ].filter((v): v is string => typeof v === "string").join(" ");
    const isTimeout = controller.signal.aborted || /timeout/i.test(errMsg);
    if (isTimeout) {
      res.status(504).json({ error: "AI request timed out. Please retry or simplify your request.", code: "AI_TIMEOUT" });
    } else {
      res.status(502).json({ error: `AI generation failed: ${errMsg || "unknown error"}`, code: "AI_GENERATION_FAILED" });
    }
    return;
  }

  const appCitations = buildCitations(retrievedChunks);
  const storedCitations = appCitations.length > 0 ? formatCitationsForStorage(appCitations) : parsedOut.citations;

  // Build sourcesUsed data for persistence
  const sourcesUsedData = builtContext?.sourceSummary?.map(s => ({
    type: s.type,
    id: s.id,
    title: s.title,
    chunkCount: s.chunkCount,
  })) || [];

  const paramsWithSources = {
    ...p,
    retrievalMode: retrievalMode.mode,
    sourcesUsed: sourcesUsedData,
    chunksRetrieved: retrievedChunks.length,
    timestamp: new Date().toISOString(),
  };

  const [row] = await db.insert(aiConversationsTable).values({
    matterId: mid,
    userId: user.id,
    workflow: String(workflow),
    title: parsedOut.title,
    params: paramsWithSources,
    query: userPrompt,
    response: parsedOut.content,
    model: AI_MODEL,
    explanation: parsedOut.explanation || null,
    riskLevel: wf.risk,
    confidenceScore: parsedOut.confidence != null ? parsedOut.confidence.toFixed(2) : null,
    citations: storedCitations,
    citationStatus: storedCitations.length ? "unverified" : "none",
    reviewStatus: "pending",
  }).returning();

  await db.insert(retrievalLogsTable).values({
    conversationId: row.id,
    userId: user.id,
    matterId: mid,
    query: String(instructions || p.query || "matter context"),
    retrievalMode: retrievalMode.mode,
    chunksRetrieved: retrievedChunks.length,
    sourcesUsed: sourcesUsedData,
    model: AI_MODEL,
  } as any);

  await auditAi(req, row, "ai_output_generated", `${wf.label} (${wf.risk} risk) generated by ${AI_MODEL} — confidence ${parsedOut.confidence ?? "unavailable"}, ${storedCitations.length} citation(s), ${retrievedChunks.length} chunk(s) retrieved via ${retrievalMode.mode}`, user.id);
  res.status(201).json(enrichOutput(row, await userMap()));
});

// ── Voice transcription ──────────────────────────────────────────────────────
// This endpoint intentionally returns only text. The browser sends the
// in-memory recording as raw bytes and the provider receives a temporary file
// wrapper; no audio is stored in PostgreSQL, object storage, audit metadata, or
// application logs.
router.post("/ai/transcribe", (req, res, next) => {
  parseAudioBody(req, res, (error) => {
    if (error) {
      if ((error as { type?: string }).type === "entity.too.large") {
        res.status(413).json({
          error: `Audio must be ${MAX_TRANSCRIPTION_BYTES / (1024 * 1024)} MB or smaller.`,
          code: "AUDIO_TOO_LARGE",
        });
        return;
      }
      res.status(400).json({
        error: "The audio request could not be read.",
        code: "AUDIO_INVALID",
      });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const user = await requireRole(req, res, AI_AUTHOR_ROLES, "Only attorneys and partners may use governed AI work.");
  if (!user) return;

  const mediaType = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!AUDIO_MEDIA_TYPES.has(mediaType)) {
    res.status(415).json({
      error: "Use a supported audio recording type: WebM, MP4, OGG, or WAV.",
      code: "UNSUPPORTED_AUDIO_TYPE",
    });
    return;
  }

  const audio = Buffer.isBuffer(req.body) ? req.body : null;
  if (!audio || audio.length === 0) {
    res.status(400).json({ error: "The audio recording is empty.", code: "AUDIO_EMPTY" });
    return;
  }
  if (audio.length > MAX_TRANSCRIPTION_BYTES) {
    res.status(413).json({
      error: `Audio must be ${MAX_TRANSCRIPTION_BYTES / (1024 * 1024)} MB or smaller.`,
      code: "AUDIO_TOO_LARGE",
    });
    return;
  }

  const client = openaiClient();
  if (!client) {
    res.status(503).json({
      error: "Speech transcription is not configured.",
      code: "TRANSCRIPTION_UNAVAILABLE",
    });
    return;
  }
  if (!TRANSCRIPTION_MODEL) {
    res.status(503).json({
      error: "Speech transcription is not available with the current AI provider.",
      code: "TRANSCRIPTION_UNAVAILABLE",
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
  try {
    const file = await toFile(
      audio,
      `apz-legal-voice.${AUDIO_EXTENSIONS[mediaType] ?? "audio"}`,
      { type: mediaType },
    );
    const transcription = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      response_format: "json",
    }, { signal: controller.signal });
    const text = typeof transcription.text === "string" ? transcription.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "No words were detected in the recording.", code: "TRANSCRIPTION_EMPTY" });
      return;
    }
    res.json({ text });
  } catch (error: any) {
    if (controller.signal.aborted) {
      res.status(504).json({
        error: "Speech transcription timed out. You can continue by typing your request.",
        code: "TRANSCRIPTION_TIMEOUT",
      });
      return;
    }
    res.status(502).json({
      error: `Speech transcription failed: ${error?.message ?? "the provider returned an error"}`,
      code: "TRANSCRIPTION_FAILED",
    });
  } finally {
    clearTimeout(timeout);
  }
});

// ── List / get ───────────────────────────────────────────────────────────────

router.get("/ai/conversations", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const conditions: SQL[] = [];
  const mid = req.query.matterId != null ? parseInt(String(req.query.matterId), 10) : NaN;
  if (!isNaN(mid)) conditions.push(eq(aiConversationsTable.matterId, mid));
  const convos = await db.select().from(aiConversationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(aiConversationsTable.createdAt));
  const users = await userMap();
  res.json(convos.map((c) => enrichOutput(c, users)));
});

router.get("/ai/outputs/:id", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(aiConversationsTable).where(eq(aiConversationsTable.id, id));
  if (!row) { res.status(404).json({ error: "AI output not found" }); return; }
  res.json(enrichOutput(row, await userMap()));
});

// ── Governance actions ───────────────────────────────────────────────────────

// Human review: attorney marks the output reviewed, optionally as an override
// (the attorney disagrees with / materially changed the AI position).
router.post("/ai/outputs/:id/review", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may review AI work product.");
  if (!user) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(aiConversationsTable).where(eq(aiConversationsTable.id, id));
  if (!row) { res.status(404).json({ error: "AI output not found" }); return; }
  if (row.reviewStatus !== "pending") {
    res.status(409).json({ error: "This output has already been reviewed.", code: "ALREADY_REVIEWED" });
    return;
  }
  const decision = String(req.body?.decision ?? "reviewed");
  if (!["reviewed", "overridden"].includes(decision)) {
    res.status(400).json({ error: "decision must be reviewed or overridden" });
    return;
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (decision === "overridden" && !note) {
    res.status(400).json({ error: "An override requires a note explaining the human decision.", code: "NOTE_REQUIRED" });
    return;
  }
  const [updated] = await db.update(aiConversationsTable).set({
    reviewStatus: decision,
    humanOverride: decision === "overridden",
    reviewNote: note || null,
    reviewedById: user.id,
    reviewedAt: new Date(),
  }).where(eq(aiConversationsTable.id, id)).returning();
  await auditAi(req, updated, decision === "overridden" ? "ai_output_overridden" : "ai_output_reviewed", `${decision === "overridden" ? "Human override" : "Human review"} by ${user.name}${note ? `: ${note}` : ""}`, user.id);
  res.json(enrichOutput(updated, await userMap()));
});

router.post("/ai/outputs/:id/verify-citations", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may verify citations.");
  if (!user) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(aiConversationsTable).where(eq(aiConversationsTable.id, id));
  if (!row) { res.status(404).json({ error: "AI output not found" }); return; }
  if (row.citationStatus !== "unverified") {
    res.status(409).json({ error: `Citations are ${row.citationStatus === "none" ? "not present" : "already verified"}.`, code: "CITATION_STATE" });
    return;
  }
  const [updated] = await db.update(aiConversationsTable).set({ citationStatus: "verified" }).where(eq(aiConversationsTable.id, id)).returning();
  await auditAi(req, updated, "ai_citations_verified", `Citations verified by ${user.name} (${(row.citations ?? []).length} citation(s))`, user.id);
  res.json(enrichOutput(updated, await userMap()));
});

// Save the AI output into the matter as a governed document. The document is
// created at the START of the document lifecycle (draft, ai_generated) — AI
// content can never bypass document governance.
router.post("/ai/outputs/:id/save-to-matter", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may save AI work product to a matter.");
  if (!user) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(aiConversationsTable).where(eq(aiConversationsTable.id, id));
  if (!row) { res.status(404).json({ error: "AI output not found" }); return; }
  if (!row.matterId) { res.status(409).json({ error: "This output is not linked to a matter.", code: "NO_MATTER" }); return; }
  if (row.documentId) {
    res.status(409).json({ error: "This output has already been saved to the matter.", code: "ALREADY_SAVED" });
    return;
  }
  // High-risk AI output must be human-reviewed before it becomes work product.
  if (row.riskLevel === "high" && row.reviewStatus === "pending") {
    res.status(409).json({ error: "High-risk AI output requires attorney review before it can be saved as work product.", code: "REVIEW_REQUIRED" });
    return;
  }
  const wf = AI_WORKFLOWS[row.workflow];
  const content = typeof req.body?.content === "string" && req.body.content.trim() ? req.body.content : row.response;
  const edited = content !== row.response;

  let doc: typeof documentsTable.$inferSelect | null = null;
  await db.transaction(async (tx) => {
    // Atomically claim the output first (guards against concurrent double-save):
    // the conditional update succeeds for exactly one request.
    const claimed = await tx.update(aiConversationsTable)
      .set({ documentId: -1 })
      .where(and(eq(aiConversationsTable.id, row.id), isNull(aiConversationsTable.documentId)))
      .returning();
    if (!claimed.length) return;
    const [created] = await tx.insert(documentsTable).values({
      matterId: row.matterId!,
      title: row.title ?? `${wf?.label ?? "AI output"}`,
      documentType: wf?.documentType ?? "general",
      content,
      contentOrigin: edited ? "ai_assisted" : "ai_generated",
      aiGenerated: true,
      sections: [{ heading: row.title ?? wf?.label ?? "AI output", origin: edited ? "ai_assisted" : "ai_generated", summary: `Generated by ${row.model ?? "AI"} via ${wf?.label ?? row.workflow} workflow${edited ? ", edited by attorney before saving" : ""}` }],
      aiRiskLevel: row.riskLevel,
      confidenceScore: row.confidenceScore,
      citations: row.citations ?? [],
      citationStatus: row.citations?.length ? row.citationStatus : "none",
      createdById: user.id,
    }).returning();
    await tx.insert(documentVersionsTable).values({
      documentId: created.id,
      version: created.version,
      title: created.title,
      content: created.content,
      contentOrigin: created.contentOrigin,
      authorId: user.id,
      changeSummary: `Created from AI output #${row.id} (${wf?.label ?? row.workflow})`,
    });
    await tx.update(aiConversationsTable).set({ documentId: created.id }).where(eq(aiConversationsTable.id, row.id));
    doc = created;
  });
  if (!doc) {
    res.status(409).json({ error: "This output has already been saved to the matter.", code: "ALREADY_SAVED" });
    return;
  }
  const savedDoc: typeof documentsTable.$inferSelect = doc;

  await logAudit({
    action: "document_created",
    entityType: "document",
    entityId: savedDoc.id,
    entityTitle: savedDoc.title,
    userId: user.id,
    details: `Document "${savedDoc.title}" created from AI output #${row.id} (v1, ${savedDoc.contentOrigin})`,
    ipAddress: req.ip,
  });
  await auditAi(req, row, "ai_output_saved_to_matter", `Saved to matter as document "${savedDoc.title}" (#${savedDoc.id}) — enters document governance at draft`, user.id);
  res.status(201).json({ output: enrichOutput({ ...row, documentId: savedDoc.id }, await userMap()), documentId: savedDoc.id });
});

export default router;
