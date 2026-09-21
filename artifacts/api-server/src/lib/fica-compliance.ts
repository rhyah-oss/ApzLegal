import { db, clientsTable, ficaDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const FICA_REQUIREMENTS: Record<string, { type: string; label: string; critical: boolean }[]> = {
  individual: [
    { type: "id_document", label: "ID / Passport", critical: true },
    { type: "proof_of_address", label: "Proof of Address", critical: true },
  ],
  corporate: [
    { type: "id_document", label: "ID / Passport (Director)", critical: true },
    { type: "company_registration", label: "Company Registration", critical: true },
    { type: "proof_of_address", label: "Proof of Address", critical: true },
    { type: "beneficial_ownership", label: "Beneficial Ownership", critical: true },
  ],
  trust: [
    { type: "id_document", label: "ID / Passport (Trustee)", critical: true },
    { type: "trust_deed", label: "Trust Deed", critical: true },
    { type: "proof_of_address", label: "Proof of Address", critical: true },
    { type: "beneficial_ownership", label: "Beneficial Ownership", critical: true },
  ],
  government: [
    { type: "id_document", label: "ID / Passport", critical: true },
    { type: "mandate_letter", label: "Official Mandate / Letter", critical: true },
    { type: "proof_of_address", label: "Proof of Address", critical: true },
  ],
};

/** Re-evaluate all mandatory FICA documents and persist the current status. */
export async function recomputeCompliance(clientId: number): Promise<{ status: "compliant" | "review_required" | "blocked"; reason: string | null }> {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) return { status: "review_required", reason: "Client not found" };

  const requirements = FICA_REQUIREMENTS[client.type] ?? FICA_REQUIREMENTS.individual;
  const docs = await db.select().from(ficaDocumentsTable).where(eq(ficaDocumentsTable.clientId, clientId));
  const docMap = new Map(docs.map((doc) => [doc.type, doc]));
  let status: "compliant" | "review_required" | "blocked" = "compliant";
  let reason: string | null = null;

  for (const requirement of requirements) {
    if (!requirement.critical) continue;
    const doc = docMap.get(requirement.type);
    if (!doc || doc.status === "missing") {
      status = "blocked";
      reason = reason ?? `Missing ${requirement.label}`;
    } else if (doc.status === "rejected") {
      status = "blocked";
      reason = reason ?? `${requirement.label} was rejected`;
    } else if (doc.status === "expired" || (doc.expiryDate != null && new Date(doc.expiryDate) < new Date())) {
      status = "blocked";
      reason = reason ?? `${requirement.label} has expired`;
    } else if (doc.status === "uploaded" || doc.status === "pending_verification") {
      if (status !== "blocked") status = "review_required";
      reason = reason ?? `${requirement.label} is awaiting verification`;
    }
  }

  const ficaStatus = status === "compliant" ? "compliant" : status === "blocked" ? "blocked" : "pending";
  await db.update(clientsTable)
    .set({ complianceStatus: status, complianceBlockReason: reason, ficaStatus })
    .where(eq(clientsTable.id, clientId));
  return { status, reason };
}