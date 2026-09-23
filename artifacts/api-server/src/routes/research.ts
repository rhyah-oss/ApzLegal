import { Router, type IRouter } from "express";
import {
  db, researchRecordsTable, knowledgeItemsTable, usersTable, mattersTable, clientsTable, documentChunksTable, knowledgeChunksTable,
} from "@workspace/db";
import { eq, and, desc, or, ilike, inArray, type SQL } from "drizzle-orm";
import OpenAI from "openai";
import { getCurrentUser, logAudit } from "../lib/context";
import { aiConfig } from "../lib/ai-client";
import { retrieveForResearch } from "../lib/retrieval-service";
import { buildResearchContext } from "../lib/context-builder";
import { buildCitations, formatCitationsForStorage, buildSourceSummary } from "../lib/citation-service";

import { hasMatterAccess } from "../lib/permissions";
import { recordResearchProviderFailure } from "../lib/metrics";

const router: IRouter = Router();

// ── Research sources (PRD v2, User Journey 4) ────────────────────────────────
// Internal sources are live. External sources (case law, legislation) have no
// live database integration yet — they are AI-assisted and clearly labelled as
// such; live SAFLII / legislation integrations are Phase 1D.
export const RESEARCH_SOURCES: Record<string, { label: string; kind: "internal" | "external"; live: boolean }> = {
  firm_precedents: { label: "Firm Precedents", kind: "internal", live: true },
  knowledge_base: { label: "Knowledge Base", kind: "internal", live: true },
  case_law: { label: "Case Law", kind: "external", live: false },
  legislation: { label: "Legislation", kind: "external", live: false },
};

const openaiClient = () => aiConfig.client;
const AI_MODEL = aiConfig.model;

async function requireUser(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return null; }
  return user;
}

async function userMap() {
  const users = await db.select().from(usersTable);
  return new Map(users.map((u) => [u.id, u.name]));
}

function enrichRecord(r: typeof researchRecordsTable.$inferSelect, users: Map<number, string>) {
  return {
    id: r.id,
    matterId: r.matterId,
    query: r.query,
    sourcesRequested: r.sourcesRequested,
    sources: r.sourcesRequested.map((s) => ({
      source: s,
      label: RESEARCH_SOURCES[s]?.label ?? s,
      kind: RESEARCH_SOURCES[s]?.kind ?? "external",
      live: RESEARCH_SOURCES[s]?.live ?? false,
      availability: RESEARCH_SOURCES[s]?.live
        ? "available"
        : "Phase 1D — live integration not yet connected; results are AI-assisted and must be verified",
    })),
    internalResults: (r.internalResults as unknown[]) ?? [],
    aiStatus: r.aiStatus,
    aiError: r.aiError,
    aiSummary: r.aiSummary,
    caseReferences: r.caseReferences ?? [],
    legislation: r.legislation ?? [],
    citations: r.citations ?? [],
    citationStatus: r.citationStatus,
    confidenceScore: r.confidenceScore != null ? parseFloat(r.confidenceScore as string) : null,
    explanation: r.explanation,
    model: r.model,
    savedToMatter: r.savedToMatter,
    savedAt: r.savedAt,
    savedBy: r.savedById ? users.get(r.savedById) ?? null : null,
    performedBy: r.userId ? users.get(r.userId) ?? null : null,
    createdAt: r.createdAt,
  };
}

// ── Sources catalogue ────────────────────────────────────────────────────────
router.get("/research/sources", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(Object.entries(RESEARCH_SOURCES).map(([source, s]) => ({
    source, label: s.label, kind: s.kind, live: s.live,
    availability: s.live ? "available" : "Phase 1D — live integration not yet connected; results are AI-assisted and must be verified",
  })));
});

// ── Perform research ─────────────────────────────────────────────────────────
router.post("/research/query", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { matterId, query, sources } = req.body ?? {};
  const mid = parseInt(String(matterId ?? ""), 10);
  if (isNaN(mid)) {
    res.status(400).json({ error: "Research must run in the context of a matter. Provide matterId.", code: "MATTER_REQUIRED" });
    return;
  }
  const q = String(query ?? "").trim();
  if (!q) { res.status(400).json({ error: "A research query is required.", code: "QUERY_REQUIRED" }); return; }

  const requested: string[] = Array.isArray(sources) && sources.length
    ? sources.map(String).filter((s) => RESEARCH_SOURCES[s])
    : Object.keys(RESEARCH_SOURCES);
  if (!requested.length) {
    res.status(400).json({ error: `No valid sources selected. Valid sources: ${Object.keys(RESEARCH_SOURCES).join(", ")}.`, code: "INVALID_SOURCES" });
    return;
  }

  const [matter] = await db.select().from(mattersTable).where(eq(mattersTable.id, mid));
  if (!matter || !hasMatterAccess(user, matter)) { res.status(404).json({ error: "Matter not found" }); return; }

  // Semantic retrieval: search matter documents and approved firm knowledge.
  const retrievedChunks = await retrieveForResearch(req, {
    matterId: mid,
    query: q,
    topK: 10,
    similarityThreshold: 0.25,
    includeDocuments: requested.includes("firm_precedents") || requested.includes("knowledge_base"),
    includeKnowledge: requested.includes("knowledge_base") || requested.includes("firm_precedents"),
    includeTemplates: requested.includes("firm_precedents"),
  });

  const researchContext = buildResearchContext(retrievedChunks);
  const internalResults = retrievedChunks.map(chunk => ({
    id: chunk.sourceId || chunk.id,
    title: chunk.metadata?.documentType || chunk.metadata?.category || "Retrieved chunk",
    type: chunk.sourceType,
    category: chunk.metadata?.category || chunk.metadata?.practiceArea || "General",
    status: chunk.metadata?.approvalStatus || "approved",
    source: chunk.sourceType === "matter_document" ? "firm_precedents" : "knowledge_base",
    snippet: chunk.text.slice(0, 240),
    metadata: chunk.metadata,
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId || chunk.id,
  }));

  // AI-assisted analysis (summary, case references, legislation) — honest
  // failure: internal results are still returned if the model is unavailable.
  const wantsAi = requested.includes("case_law") || requested.includes("legislation") || true;
  let aiStatus = "unavailable";
  let aiError: string | null = null;
  let aiSummary: string | null = null;
  let caseReferences: string[] = [];
  let legislation: string[] = [];
  let citations: string[] = [];
  let confidence: number | null = null;
  let explanation: string | null = null;

  const client = openaiClient();
  if (!client) {
    aiError = "AI model is not configured (OPENAI_API_KEY missing).";
  } else if (wantsAi) {
    const [clientRow] = matter.clientId ? await db.select().from(clientsTable).where(eq(clientsTable.id, matter.clientId)) : [undefined];
    const context = [
      `Matter: ${matter.title} (ref ${matter.reference ?? matter.id}); Practice area: ${matter.practiceArea ?? "unspecified"}`,
      clientRow ? `Client: ${clientRow.name}` : null,
      researchContext || "Internal firm materials found: none",
    ].filter(Boolean).join("\n");

    const aiTimeoutMs = Number.parseInt(String(process.env.AI_REQUEST_TIMEOUT_MS ?? "300000"), 10);
    const controller = new AbortController();
    const aiTimeoutHandle = setTimeout(() => controller.abort(), Number.isFinite(aiTimeoutMs) && aiTimeoutMs > 0 ? aiTimeoutMs : 300000);

    try {
      const completion = await client.chat.completions.create(
        {
          model: AI_MODEL,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You perform legal research under South African law for an attorney.

RETRIEVED FIRM SOURCES (authorised):
${researchContext || "No authorised firm sources were retrieved for this query."}

CRITICAL RULES:
1. Base your analysis primarily on the retrieved firm sources above.
2. If the retrieved sources do not contain the answer, explicitly state: "The firm's authorised corpus does not contain information about [topic]."
3. For case_law and legislation: you have NO live access to external databases — rely only on your training knowledge and say so.
4. NEVER invent case names, citations, statute sections or authorities.
5. Distinguish between firm sources and general legal knowledge.

Respond with a single JSON object:
{
  "summary": research summary in markdown — the legal position, key authorities, and open questions,
  "caseReferences": array of real case citations relied on (empty if none you are confident of),
  "legislation": array of real statutes/sections relied on (empty if none),
  "confidence": honest integer 0-100 confidence in the legal accuracy, or null,
  "explanation": 2-4 sentences on how this was produced and its limitations
}`,
            },
            { role: "user", content: `MATTER CONTEXT:\n${context}\n\nRESEARCH QUESTION:\n${q}` },
          ],
        },
        { signal: controller.signal },
      );
      clearTimeout(aiTimeoutHandle);
      const j = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      aiSummary = typeof j.summary === "string" ? j.summary : null;
      caseReferences = Array.isArray(j.caseReferences) ? j.caseReferences.filter((c: unknown) => typeof c === "string") : [];
      legislation = Array.isArray(j.legislation) ? j.legislation.filter((c: unknown) => typeof c === "string") : [];
      confidence = typeof j.confidence === "number" && j.confidence >= 0 && j.confidence <= 100 ? j.confidence : null;
      explanation = typeof j.explanation === "string" ? j.explanation : null;
      const appCitations = buildCitations(retrievedChunks);
      citations = [...formatCitationsForStorage(appCitations), ...caseReferences, ...legislation];
      aiStatus = "ok";
    } catch (err: any) {
      clearTimeout(aiTimeoutHandle);
      recordResearchProviderFailure();
      const errMsg = [
        err?.message,
        err?.error?.message,
        err?.cause?.message,
        err?.cause?.error?.message,
        err?.statusMessage,
      ].filter((v): v is string => typeof v === "string").join(" ");
      const isTimeout = controller.signal.aborted || /timeout/i.test(errMsg);
      aiStatus = "failed";
      aiError = isTimeout ? "AI research timed out. Internal firm results are still available below." : `AI research failed: ${errMsg || "unknown error"}`;
      const appCitations = buildCitations(retrievedChunks);
      citations = [...formatCitationsForStorage(appCitations), ...caseReferences, ...legislation];
    }
  }

  const [row] = await db.insert(researchRecordsTable).values({
    matterId: mid,
    userId: user.id,
    query: q,
    sourcesRequested: requested,
    internalResults: internalResults,
    aiStatus,
    aiError,
    aiSummary,
    caseReferences,
    legislation,
    citations,
    citationStatus: citations.length ? "unverified" : "none",
    confidenceScore: confidence != null ? confidence.toFixed(2) : null,
    explanation,
    model: aiStatus === "ok" ? AI_MODEL : null,
  }).returning();

  await logAudit({
    action: "research_performed",
    entityType: "research",
    entityId: row.id,
    entityTitle: q.slice(0, 120),
    userId: user.id,
    details: `Research on sources [${requested.join(", ")}] — ${internalResults.length} internal result(s), AI ${aiStatus}${confidence != null ? `, confidence ${confidence}` : ""}, ${citations.length} citation(s), ${retrievedChunks.length} chunk(s) retrieved`,
    ipAddress: req.ip,
  });

  res.status(201).json(enrichRecord(row, await userMap()));
});

// ── List / get ───────────────────────────────────────────────────────────────
router.get("/research", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const conditions: SQL[] = [];
  if (["candidate_attorney", "paralegal", "secretary"].includes(user.role)) {
    const assigned = await db.select({ id: mattersTable.id }).from(mattersTable).where(eq(mattersTable.assignedToId, user.id));
    conditions.push(assigned.length ? inArray(researchRecordsTable.matterId, assigned.map(m => m.id)) : eq(researchRecordsTable.matterId, -1));
  }
  const mid = req.query.matterId != null ? parseInt(String(req.query.matterId), 10) : NaN;
  if (!isNaN(mid)) conditions.push(eq(researchRecordsTable.matterId, mid));
  if (String(req.query.savedOnly ?? "") === "true") conditions.push(eq(researchRecordsTable.savedToMatter, true));
  const rows = await db.select().from(researchRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(researchRecordsTable.createdAt));
  const users = await userMap();
  res.json(rows.map((r) => enrichRecord(r, users)));
});

router.get("/research/:id", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const id = parseInt(String(req.params.id), 10);
  const [row] = isNaN(id) ? [undefined] : await db.select().from(researchRecordsTable).where(eq(researchRecordsTable.id, id));
  if (!row) { res.status(404).json({ error: "Research record not found" }); return; }
  if (["candidate_attorney", "paralegal", "secretary"].includes(user.role)) {
    const [matter] = await db.select({ id: mattersTable.id }).from(mattersTable).where(and(eq(mattersTable.id, row.matterId), eq(mattersTable.assignedToId, user.id)));
    if (!matter) { res.status(403).json({ error: "You do not have access to this research record.", code: "ASSIGNMENT_REQUIRED" }); return; }
  }
  res.json(enrichRecord(row, await userMap()));
});

// ── Save to matter ───────────────────────────────────────────────────────────
router.post("/research/:id/save-to-matter", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const id = parseInt(String(req.params.id), 10);
  const [row] = isNaN(id) ? [undefined] : await db.select().from(researchRecordsTable).where(eq(researchRecordsTable.id, id));
  if (!row) { res.status(404).json({ error: "Research record not found" }); return; }

  // Atomic claim — only one save succeeds.
  const claimed = await db.update(researchRecordsTable)
    .set({ savedToMatter: true, savedAt: new Date(), savedById: user.id })
    .where(and(eq(researchRecordsTable.id, id), eq(researchRecordsTable.savedToMatter, false)))
    .returning();
  if (!claimed.length) {
    res.status(409).json({ error: "This research has already been saved to the matter.", code: "ALREADY_SAVED" });
    return;
  }

  await logAudit({
    action: "research_saved_to_matter",
    entityType: "research",
    entityId: row.id,
    entityTitle: row.query.slice(0, 120),
    userId: user.id,
    details: `Research saved to matter — sources [${row.sourcesRequested.join(", ")}], ${(row.citations ?? []).length} citation(s), AI ${row.aiStatus}`,
    ipAddress: req.ip,
  });

  res.json(enrichRecord(claimed[0], await userMap()));
});

export default router;
