import { Router, type IRouter } from "express";
import { db, ficaDocumentsTable, complianceEventsTable, clientsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { COMPLIANCE_ROLES, LEGAL_AUTHOR_ROLES, requireRole } from "../lib/permissions";

const router: IRouter = Router();

// ── FICA requirements per client type ─────────────────────────────────────────
const REQUIREMENTS: Record<string, { type: string; label: string; critical: boolean }[]> = {
  individual: [
    { type: "id_document",        label: "ID / Passport",       critical: true  },
    { type: "proof_of_address",   label: "Proof of Address",    critical: true  },
  ],
  corporate: [
    { type: "id_document",        label: "ID / Passport (Director)", critical: true  },
    { type: "company_registration", label: "Company Registration", critical: true  },
    { type: "proof_of_address",   label: "Proof of Address",    critical: true  },
    { type: "beneficial_ownership", label: "Beneficial Ownership", critical: true },
  ],
  trust: [
    { type: "id_document",        label: "ID / Passport (Trustee)", critical: true },
    { type: "trust_deed",         label: "Trust Deed",           critical: true  },
    { type: "proof_of_address",   label: "Proof of Address",    critical: true  },
    { type: "beneficial_ownership", label: "Beneficial Ownership", critical: true },
  ],
  government: [
    { type: "id_document",        label: "ID / Passport",       critical: true  },
    { type: "mandate_letter",     label: "Official Mandate / Letter", critical: true },
    { type: "proof_of_address",   label: "Proof of Address",    critical: true  },
  ],
};

// ── Recompute and persist compliance status ───────────────────────────────────
async function recomputeCompliance(clientId: number): Promise<{ status: string; reason: string | null }> {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) return { status: "review_required", reason: null };

  const reqs   = REQUIREMENTS[client.type] ?? REQUIREMENTS.individual;
  const docs   = await db.select().from(ficaDocumentsTable).where(eq(ficaDocumentsTable.clientId, clientId));
  const docMap = new Map(docs.map(d => [d.type, d]));

  let status: "compliant" | "review_required" | "blocked" = "compliant";
  let blockReason: string | null = null;

  for (const req of reqs) {
    if (!req.critical) continue;
    const doc = docMap.get(req.type);
    if (!doc || doc.status === "missing") {
      status      = "blocked";
      blockReason = blockReason ?? `Missing ${req.label}`;
    } else if (doc.status === "rejected") {
      status      = "blocked";
      blockReason = blockReason ?? `${req.label} was rejected`;
    } else if (doc.status === "expired" || (doc.expiryDate != null && new Date(doc.expiryDate) < new Date())) {
      status      = "blocked";
      blockReason = blockReason ?? `${req.label} has expired`;
    } else if (doc.status === "uploaded" || doc.status === "pending_verification") {
      if (status !== "blocked") status = "review_required";
    }
  }

  // Derive overall ficaStatus
  const ficaStatus = status === "compliant" ? "compliant" : status === "blocked" ? "blocked" : "pending";

  // Persist
  await db.update(clientsTable)
    .set({ complianceStatus: status, complianceBlockReason: blockReason, ficaStatus })
    .where(eq(clientsTable.id, clientId));

  return { status, reason: blockReason };
}

// ── Log compliance event ──────────────────────────────────────────────────────
async function logEvent(
  clientId: number, eventType: string, description: string,
  opts: { ficaDocumentId?: number; userId?: number; metadata?: string } = {}
) {
  await db.insert(complianceEventsTable).values({
    clientId, eventType, description,
    ficaDocumentId: opts.ficaDocumentId ?? null,
    userId:         opts.userId         ?? null,
    metadata:       opts.metadata       ?? null,
  });
}

// ── GET /clients/:id/fica/requirements ────────────────────────────────────────
router.get("/clients/:id/fica/requirements", async (req, res): Promise<void> => {
  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) { res.status(404).json({ error: "Not found" }); return; }

  const reqs = REQUIREMENTS[client.type] ?? REQUIREMENTS.individual;
  const docs = await db.select().from(ficaDocumentsTable).where(eq(ficaDocumentsTable.clientId, clientId));
  const docMap = new Map(docs.map(d => [d.type, d]));

  const requirements = await Promise.all(reqs.map(async req => {
    const doc = docMap.get(req.type) ?? null;
    let verifiedByName: string | null = null;
    if (doc?.verifiedById) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, doc.verifiedById));
      verifiedByName = u?.name ?? null;
    }
    return {
      type:           req.type,
      label:          req.label,
      critical:       req.critical,
      status:         doc?.status ?? "missing",
      expiryDate:     doc?.expiryDate ?? null,
      uploadedAt:     doc?.uploadedAt ?? null,
      verifiedAt:     doc?.verifiedAt ?? null,
      verifiedByName,
      rejectedReason: doc?.rejectedReason ?? null,
      documentRef:    doc?.documentRef ?? null,
      notes:          doc?.notes ?? null,
      ficaDocumentId: doc?.id ?? null,
    };
  }));

  // Also include non-required docs uploaded for this client
  const extraDocs = docs.filter(d => !reqs.find(r => r.type === d.type));

  res.json({
    clientId,
    clientType:        client.type,
    complianceStatus:  client.complianceStatus,
    blockReason:       client.complianceBlockReason,
    riskLevel:         client.riskLevel,
    riskScore:         client.riskScore,
    requirements,
    extraDocuments: extraDocs,
  });
});

// ── POST /clients/:id/fica/documents — register / upload a doc ────────────────
router.post("/clients/:id/fica/documents", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, LEGAL_AUTHOR_ROLES, "Only legal staff may register FICA documents.");
  if (!user) return;
  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { type, expiryDate, documentRef, notes, fileObjectPath, originalFilename, mimeType, fileSize, fileChecksum } = req.body;
  if (!type) { res.status(400).json({ error: "type is required" }); return; }
  if (fileObjectPath && (!/^\/objects\/[A-Za-z0-9._/-]+$/.test(fileObjectPath) || !originalFilename || !mimeType || !Number.isInteger(fileSize) || fileSize <= 0 || !fileChecksum)) {
    res.status(400).json({ error: "Uploaded FICA files require a valid object path and complete integrity metadata." });
    return;
  }

  // Upsert — one doc per type per client
  const existing = await db.select().from(ficaDocumentsTable)
    .where(and(eq(ficaDocumentsTable.clientId, clientId), eq(ficaDocumentsTable.type, type)));

  let doc;
  if (existing.length > 0) {
    [doc] = await db.update(ficaDocumentsTable)
      .set({ status: "uploaded", uploadedAt: new Date(), expiryDate, documentRef: fileObjectPath ?? documentRef, notes, fileObjectPath, originalFilename, mimeType, fileSize, fileChecksum })
      .where(eq(ficaDocumentsTable.id, existing[0].id))
      .returning();
  } else {
    [doc] = await db.insert(ficaDocumentsTable).values({
      clientId, type, status: "uploaded",
      uploadedAt: new Date(), expiryDate, documentRef: fileObjectPath ?? documentRef, notes,
      fileObjectPath, originalFilename, mimeType, fileSize, fileChecksum,
    }).returning();
  }

  const reqs = REQUIREMENTS[(await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)))[0]?.type ?? "individual"] ?? REQUIREMENTS.individual;
  const label = reqs.find(r => r.type === type)?.label ?? type;
  await logEvent(clientId, "document_uploaded", `${label} uploaded`, { ficaDocumentId: doc.id, userId: user.id });

  const { status, reason } = await recomputeCompliance(clientId);
  res.status(201).json({ document: doc, complianceStatus: status, blockReason: reason });
});

// ── PATCH /clients/:id/fica/documents/:docId — verify / reject / expire ───────
router.patch("/clients/:id/fica/documents/:docId", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may verify or reject FICA documents.");
  if (!user) return;
  const clientId = parseInt(req.params.id,    10);
  const docId    = parseInt(req.params.docId, 10);
  if (isNaN(clientId) || isNaN(docId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(ficaDocumentsTable)
    .where(and(eq(ficaDocumentsTable.id, docId), eq(ficaDocumentsTable.clientId, clientId)));
  if (!existing) { res.status(404).json({ error: "Document not found" }); return; }

  const { status, rejectedReason, expiryDate, documentRef, notes } = req.body;
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  const allowedStatuses = ["uploaded", "pending_verification", "verified", "rejected", "expired"];
  if (!allowedStatuses.includes(status)) { res.status(400).json({ error: "Invalid FICA document status" }); return; }
  if (["verified", "rejected", "expired"].includes(status) && !["uploaded", "pending_verification"].includes(existing.status)) {
    res.status(409).json({ error: `A FICA document in "${existing.status}" cannot transition to "${status}".`, code: "INVALID_FICA_TRANSITION" });
    return;
  }

  const updates: Partial<typeof ficaDocumentsTable.$inferInsert & { verifiedAt?: Date }> = {
    status, rejectedReason, expiryDate, documentRef, notes,
  };
  if (status === "verified")  updates.verifiedAt = new Date();
  if (status === "verified") updates.verifiedById = user.id;

  const [doc] = await db.update(ficaDocumentsTable).set(updates)
    .where(eq(ficaDocumentsTable.id, docId)).returning();

  // Compliance client type to get label
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  const reqs  = REQUIREMENTS[client?.type ?? "individual"] ?? REQUIREMENTS.individual;
  const label = reqs.find(r => r.type === doc.type)?.label ?? doc.type;

  const eventMap: Record<string, string> = {
    verified:             "document_verified",
    rejected:             "document_rejected",
    expired:              "document_expired",
    pending_verification: "document_uploaded",
  };
  const evtType = eventMap[status] ?? "document_uploaded";
  const descMap: Record<string, string> = {
    verified: `${label} verified`,
    rejected: `${label} rejected${rejectedReason ? `: ${rejectedReason}` : ""}`,
    expired:  `${label} marked as expired`,
    pending_verification: `${label} submitted for verification`,
  };
  await logEvent(clientId, evtType, descMap[status] ?? `${label} status changed to ${status}`, {
    ficaDocumentId: docId, userId: user.id,
  });

  const { status: compStatus, reason } = await recomputeCompliance(clientId);
  res.json({ document: doc, complianceStatus: compStatus, blockReason: reason });
});

// ── DELETE /clients/:id/fica/documents/:docId ─────────────────────────────────
router.delete("/clients/:id/fica/documents/:docId", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may remove FICA documents.");
  if (!user) return;
  const clientId = parseInt(req.params.id,    10);
  const docId    = parseInt(req.params.docId, 10);
  if (isNaN(clientId) || isNaN(docId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(ficaDocumentsTable)
    .where(and(eq(ficaDocumentsTable.id, docId), eq(ficaDocumentsTable.clientId, clientId)));
  await recomputeCompliance(clientId);
  res.status(204).send();
});

// ── GET /clients/:id/fica/timeline ────────────────────────────────────────────
router.get("/clients/:id/fica/timeline", async (req, res): Promise<void> => {
  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const events = await db.select().from(complianceEventsTable)
    .where(eq(complianceEventsTable.clientId, clientId))
    .orderBy(desc(complianceEventsTable.createdAt))
    .limit(100);

  const enriched = await Promise.all(events.map(async e => {
    let userName: string | null = null;
    if (e.userId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, e.userId));
      userName = u?.name ?? null;
    }
    return { ...e, userName };
  }));

  res.json(enriched);
});

// ── POST /clients/:id/fica/recompute ──────────────────────────────────────────
router.post("/clients/:id/fica/recompute", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may recompute FICA status.");
  if (!user) return;
  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await recomputeCompliance(clientId);
  res.json(result);
});

// ── POST /clients/:id/fica/manual-override ────────────────────────────────────
router.post("/clients/:id/fica/manual-override", async (req, res): Promise<void> => {
  const user = await requireRole(req, res, COMPLIANCE_ROLES, "Only compliance staff may override FICA status.");
  if (!user) return;
  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { complianceStatus, reason } = req.body;
  if (!["compliant", "review_required", "blocked"].includes(complianceStatus)) {
    res.status(400).json({ error: "Invalid compliance status" });
    return;
  }
  if (!String(reason ?? "").trim()) {
    res.status(400).json({ error: "A written reason is required for a compliance override.", code: "OVERRIDE_REASON_REQUIRED" });
    return;
  }
  await db.update(clientsTable)
    .set({ complianceStatus, complianceBlockReason: reason ?? null })
    .where(eq(clientsTable.id, clientId));
  await logEvent(clientId, "manual_override",
    `Compliance status manually set to ${complianceStatus}${reason ? `: ${reason}` : ""}`,
    { userId: user.id });
  res.json({ ok: true });
});

// ── GET /fica/dashboard — all clients with compliance state ───────────────────
router.get("/fica/dashboard", async (req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable)
    .where(eq(clientsTable.status, "active"))
    .orderBy(clientsTable.name);

  const results = await Promise.all(clients.map(async c => {
    const reqs   = REQUIREMENTS[c.type] ?? REQUIREMENTS.individual;
    const docs   = await db.select().from(ficaDocumentsTable).where(eq(ficaDocumentsTable.clientId, c.id));
    const docMap = new Map(docs.map(d => [d.type, d]));

    const summary = reqs.map(req => ({
      type:     req.type,
      label:    req.label,
      critical: req.critical,
      status:   docMap.get(req.type)?.status ?? "missing",
    }));

    const missing  = summary.filter(r => r.critical && r.status === "missing").length;
    const rejected = summary.filter(r => r.critical && r.status === "rejected").length;
    const expired  = summary.filter(r => r.critical && r.status === "expired").length;
    const pending  = summary.filter(r => r.critical && (r.status === "uploaded" || r.status === "pending_verification")).length;

    return {
      id:               c.id,
      name:             c.name,
      type:             c.type,
      complianceStatus: c.complianceStatus,
      riskLevel:        c.riskLevel,
      riskScore:        c.riskScore,
      missing,
      rejected,
      expired,
      pending,
      requirements: summary,
    };
  }));

  res.json(results);
});

// ── GET /fica/expiring — active FICA documents expiring soon ─────────────────
router.get("/fica/expiring", async (req, res): Promise<void> => {
  const requestedDays = Number.parseInt(String(req.query.days ?? "30"), 10);
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 1), 365) : 30;
  const now = new Date();
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + days);
  const [docs, clients] = await Promise.all([
    db.select().from(ficaDocumentsTable),
    db.select().from(clientsTable).where(eq(clientsTable.status, "active")),
  ]);
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const expiring = docs
    .filter((doc) => {
      if (!doc.expiryDate || !clientById.has(doc.clientId)) return false;
      const expiry = new Date(doc.expiryDate);
      return expiry >= now && expiry <= deadline && !["rejected", "expired"].includes(doc.status);
    })
    .map((doc) => {
      const expiry = new Date(doc.expiryDate!);
      return {
        id: doc.id,
        clientId: doc.clientId,
        clientName: clientById.get(doc.clientId)?.name ?? "Unknown client",
        type: doc.type,
        expiryDate: doc.expiryDate,
        status: doc.status,
        daysRemaining: Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  res.json({ days, documents: expiring });
});

export default router;
