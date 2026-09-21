import assert from "node:assert/strict";
import crypto from "node:crypto";

const baseUrl = process.env.APZ_API_URL || "http://127.0.0.1:8080/api";
const email = process.env.APZ_TEST_EMAIL || "admin@apzlegal.co.za";
const password = process.env.APZ_TEST_PASSWORD || "password123";
let cookie = "";

async function request(path, options = {}) {
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, body };
}

async function loginSession(accountEmail, accountPassword = password) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: accountEmail, password: accountPassword }),
    redirect: "manual",
  });
  const text = await response.text();
  assert.ok(response.ok, `login ${accountEmail}: ${response.status} ${text}`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, `login ${accountEmail} returned a session cookie`);
  return setCookie.split(";")[0];
}

async function requestWithCookie(sessionCookie, path, options = {}) {
  const headers = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
    cookie: sessionCookie,
  };
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, body };
}

function ok(result, message) {
  assert.ok(result.response.ok, `${message}: ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

function status(result, expected, message) {
  assert.equal(result.response.status, expected, `${message}: ${JSON.stringify(result.body)}`);
  return result.body;
}

const unauthenticatedUpload = await fetch(`${baseUrl}/storage/uploads/request-url`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "unauthorized.txt", size: 1, contentType: "text/plain" }),
});
assert.equal(unauthenticatedUpload.status, 401, "upload URL cannot be requested without authentication");
const unauthenticatedTranscription = await fetch(`${baseUrl}/ai/transcribe`, {
  method: "POST",
  headers: { "content-type": "audio/webm" },
  body: Buffer.from("unauthenticated audio"),
});
assert.equal(unauthenticatedTranscription.status, 401, "voice transcription cannot be requested without authentication");
const unauthenticatedEmailReadiness = await fetch(`${baseUrl}/email/readiness`, {
  headers: { accept: "application/json" },
});
assert.equal(unauthenticatedEmailReadiness.status, 401, "email readiness cannot be read without authentication");

const login = ok(await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
}), "staff login");
assert.equal(login.user.email, email, "login returned the expected staff user");
const emailReadiness = ok(await request("/email/readiness"), "email readiness");
assert.equal(emailReadiness.status, "not_connected", "email readiness is honest when no provider is configured");
status(await request("/emails/ingest", {
  method: "POST",
  body: JSON.stringify({
    provider: "regression-provider",
    externalMessageId: "message-provider-not-connected",
    externalThreadId: "thread-regression",
    senderEmail: "sender@example.com",
    receivedAt: new Date().toISOString(),
  }),
}), 409, "normalized ingestion is blocked until a provider is connected");
status(await request("/ai/transcribe", {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: "not audio",
}), 415, "voice transcription rejects unsupported media");
status(await request("/ai/transcribe", {
  method: "POST",
  headers: { "content-type": "audio/webm" },
  body: Buffer.alloc(0),
}), 400, "voice transcription rejects empty audio");

const matters = ok(await request("/matters"), "list matters");
assert.ok(matters.length > 0, "regression requires one seeded matter");
const matterId = matters[0].id;
const unique = crypto.randomUUID();

async function verifyProductivityDatePersistence() {
  const backdatedDate = "1999-12-31";
  const query = `startDate=${backdatedDate}&endDate=${backdatedDate}`;
  const baselineEntries = ok(await request(`/time-entries?${query}`), "list baseline backdated time entries");
  const baselineSummary = ok(await request(`/productivity/summary?${query}`), "load baseline backdated productivity");
  let createdEntry;

  try {
    createdEntry = ok(await request("/time-entries", {
      method: "POST",
      body: JSON.stringify({
        matterId,
        description: `[REGRESSION] backdated productivity ${unique}`,
        hours: 1.25,
        rate: 1,
        date: backdatedDate,
      }),
    }), "create backdated time entry");
    assert.equal(createdEntry.entryDate, backdatedDate, "time-entry date persists to entry_date");

    const filteredEntries = ok(await request(`/time-entries?${query}`), "filter backdated time entries");
    assert.ok(filteredEntries.some((entry) => entry.id === createdEntry.id), "date-filtered time list includes the backdated entry");

    const summary = ok(await request(`/productivity/summary?${query}`), "load backdated productivity");
    assert.equal(summary.kpis.totalHours, baselineSummary.kpis.totalHours + 1.25, "productivity total uses persisted entry date");
    assert.equal(summary.kpis.activitiesLogged, baselineSummary.kpis.activitiesLogged + 1, "productivity activity count uses persisted entry date");
    assert.equal(summary.health.missingDate, baselineSummary.health.missingDate, "dated entry does not increase missing-date health count");
    assert.equal(
      summary.trend.reduce((sum, point) => sum + point.totalHours, 0),
      baselineSummary.trend.reduce((sum, point) => sum + point.totalHours, 0) + 1.25,
      "productivity trend buckets the backdated entry on its persisted date",
    );
    assert.equal(filteredEntries.length, baselineEntries.length + 1, "exact date filter adds only the regression entry");
  } finally {
    if (createdEntry?.id) status(await request(`/time-entries/${createdEntry.id}`, { method: "DELETE" }), 204, "delete backdated time entry");
  }
}

await verifyProductivityDatePersistence();

const blockedClient = ok(await request("/clients", {
  method: "POST",
  body: JSON.stringify({ name: `[REGRESSION] FICA blocked client ${unique}`, type: "individual" }),
}), "create FICA-blocked onboarding fixture");
assert.equal(blockedClient.ficaStatus, "pending", "new client starts with pending FICA");
assert.equal(blockedClient.complianceStatus, "review_required", "new client starts requiring compliance review");
const blockedMatter = await request("/matters", {
  method: "POST",
  body: JSON.stringify({ title: `[REGRESSION] blocked matter ${unique}`, clientId: blockedClient.id }),
});
status(blockedMatter, 409, "FICA-blocked client cannot create a matter");
assert.equal(blockedMatter.body.code, "FICA_COMPLIANCE_REQUIRED", "FICA block returns an explicit gate code");
const refreshedAfterFicaGate = ok(await request("/matters"), "refresh matters after FICA gate");
assert.ok(!refreshedAfterFicaGate.some((matter) => matter.title === `[REGRESSION] blocked matter ${unique}`), "blocked onboarding creates no matter");

const compliantClient = ok(await request("/clients"), "refresh clients for onboarding fixture")
  .find((client) => client.complianceStatus === "compliant");
assert.ok(compliantClient, "regression requires a compliant client fixture");
const onboardingTitle = `[REGRESSION] onboarding conflict gate ${unique}`;
const onboardingMatter = ok(await request("/matters", {
  method: "POST",
  body: JSON.stringify({ title: onboardingTitle, clientId: compliantClient.id }),
}), "create onboarding matter");
assert.equal(onboardingMatter.status, "conflict_check", "onboarding always enters conflict check");
assert.equal(onboardingMatter.conflictStatus, "cleared", "onboarding persists its initial conflict screen");
const persistedOnboardingMatter = ok(await request(`/matters/${onboardingMatter.id}`), "refresh onboarding matter");
assert.equal(persistedOnboardingMatter.status, "conflict_check", "onboarding state survives refresh");
const flaggedOnboarding = ok(await request("/conflicts/check", {
  method: "POST",
  body: JSON.stringify({
    matterId: onboardingMatter.id,
    clientName: "Caller supplied name must not override Matter identity",
    opposingParty: compliantClient.name,
  }),
}), "run Matter-bound onboarding conflict scan");
assert.equal(flaggedOnboarding.status, "pending", "flagged onboarding scan waits for partner review");
const persistedFlaggedConflict = ok(await request(`/conflicts?matterId=${onboardingMatter.id}&status=pending`), "refresh Matter-bound conflict scan");
const flaggedConflict = persistedFlaggedConflict.find((conflict) => conflict.id === flaggedOnboarding.id);
assert.equal(flaggedConflict?.clientName, compliantClient.name, "Matter-bound scan uses canonical client identity");
assert.equal(flaggedConflict?.opposingParty, compliantClient.name, "Matter-bound scan persists the opposing party");
const pendingActionsEnvelope = ok(await request("/actions"), "load persisted action queue");
const pendingActions = pendingActionsEnvelope.actions;
assert.ok(Array.isArray(pendingActions), "action queue returns an actions array");
assert.ok(pendingActions.some((action) => action.type === "conflict_review" && action.entityId === flaggedOnboarding.id), "flagged conflict appears in the partner action queue");
status(await request(`/matters/${onboardingMatter.id}/status`, {
  method: "PATCH",
  body: JSON.stringify({ status: "approved" }),
}), 409, "pending conflict review blocks matter approval");
const restrictedRoleEmail = `regression-paralegal-${unique}@example.com`;
const restrictedRolePassword = `regression-password`;
const restrictedRoleUser = ok(await request("/admin/users", {
  method: "POST",
  body: JSON.stringify({
    name: `[REGRESSION] Restricted role ${unique}`,
    email: restrictedRoleEmail,
    role: "paralegal",
    temporaryPassword: restrictedRolePassword,
  }),
}), "create deterministic restricted-role fixture");
assert.equal(restrictedRoleUser.role, "paralegal", "restricted fixture has the expected role");
const paralegalSession = await loginSession(restrictedRoleEmail, restrictedRolePassword);
const restrictedProductivity = ok(await requestWithCookie(paralegalSession, "/productivity/summary"), "load restricted-role productivity");
assert.equal(restrictedProductivity.permissions.scope, "self", "restricted-role productivity is explicitly self-scoped");
assert.equal(restrictedProductivity.kpis.activitiesLogged, 0, "restricted role sees no other users' time entries");
assert.deepEqual(restrictedProductivity.users, [], "restricted role receives no other user identities");
assert.deepEqual(restrictedProductivity.matters, [], "restricted role receives no unassigned matter activity");
assert.deepEqual(restrictedProductivity.workload.inactiveMatters, [], "restricted role receives no unassigned inactive matters");
const targetedRestrictedProductivity = ok(
  await requestWithCookie(paralegalSession, `/productivity/summary?matterId=${matterId}`),
  "load targeted restricted-role productivity",
);
assert.deepEqual(targetedRestrictedProductivity.matters, [], "targeted productivity query cannot expose an unassigned matter");
assert.deepEqual(targetedRestrictedProductivity.workload.inactiveMatters, [], "targeted productivity query cannot expose an unassigned inactive matter");
status(await requestWithCookie(paralegalSession, `/matters/${matterId}/emails/999999/link`, {
  method: "POST",
  body: JSON.stringify({ action: "leave_unlinked" }),
}), 403, "non-partner staff cannot change email Matter links");
status(await requestWithCookie(paralegalSession, `/conflicts/${flaggedOnboarding.id}/review`, {
  method: "POST",
  body: JSON.stringify({ decision: "approve", reason: "Paralegal must not approve conflicts." }),
}), 403, "non-partner cannot review conflicts");
const clearedOnboarding = ok(await request(`/conflicts/${flaggedOnboarding.id}/review`, {
  method: "POST",
  body: JSON.stringify({ decision: "approve", reason: "Regression partner approval." }),
}), "partner approves onboarding conflict");
assert.equal(clearedOnboarding.status, "approved", "partner review clears the conflict record");
const approvedOnboarding = ok(await request(`/matters/${onboardingMatter.id}`), "refresh approved onboarding matter");
assert.equal(approvedOnboarding.status, "approved", "approved onboarding state persists after refresh");

status(await requestWithCookie(paralegalSession, "/provider-operations/email", {
  method: "POST",
  body: JSON.stringify({
    to: "regression@example.com",
    subject: "Unauthorized provider handoff",
    body: "This role must be rejected.",
    matterId,
    reviewed: true,
  }),
}), 403, "restricted role cannot queue provider email");

const templateTitle = `[REGRESSION] governed template ${unique}`;
const template = ok(await request("/knowledge", {
  method: "POST",
  body: JSON.stringify({
    title: templateTitle,
    type: "template",
    category: "contracts",
    documentType: "contract",
    practiceArea: "Regression",
    content: "This governed template is created by the regression journey.",
  }),
}), "create governed template");
assert.equal(template.status, "uploaded", "new template starts uploaded");
const templateVersions = ok(await request(`/knowledge/${template.id}/versions`), "list template versions");
assert.ok(templateVersions.some((version) => version.version === 1), "initial template version is retained");

ok(await request(`/knowledge/${template.id}/submit-for-review`, { method: "POST", body: JSON.stringify({}) }), "submit template for review");
const approvedTemplate = ok(await request(`/knowledge/${template.id}/decision`, {
  method: "POST",
  body: JSON.stringify({ decision: "approve", note: "Regression approval" }),
}), "approve governed template");
assert.equal(approvedTemplate.status, "approved", "approved template enters approved state");
assert.equal(approvedTemplate.availableToAi, true, "approved template is indexed for AI");
const templateLibrary = ok(await request("/templates?sort=updated"), "list governed templates");
assert.ok(templateLibrary.items.some((item) => item.id === template.id), "approved template appears in template library");

const instantiated = ok(await request(`/templates/${template.id}/instantiate`, {
  method: "POST",
  body: JSON.stringify({ matterId, title: `${templateTitle} in matter` }),
}), "instantiate approved template");
assert.equal(instantiated.status, "draft", "instantiated template starts as a draft document");
assert.equal(instantiated.sourceTemplateId, template.id, "document records source template");
assert.equal(instantiated.sourceTemplateVersion, approvedTemplate.version, "document records approved template version");

status(await request("/storage/uploads/request-url", {
  method: "POST",
  body: JSON.stringify({ name: "unsupported.zip", size: 4, contentType: "application/zip" }),
}), 400, "reject unsupported upload type");
status(await request("/storage/uploads/request-url", {
  method: "POST",
  body: JSON.stringify({ name: "oversized.txt", size: 25 * 1024 * 1024 + 1, contentType: "text/plain" }),
}), 400, "reject oversized upload");
status(await request("/matters/999999/documents", {
  method: "POST",
  body: JSON.stringify({ title: `[REGRESSION] missing matter ${unique}` }),
}), 404, "reject upload for missing matter");

const uploadBytes = Buffer.from(`APZ Legal regression upload ${unique}\n`, "utf8");
const uploadName = `regression-${unique}.txt`;
const uploadChecksum = crypto.createHash("sha256").update(uploadBytes).digest("hex");
const uploadDetails = ok(await request("/storage/uploads/request-url", {
  method: "POST",
  body: JSON.stringify({ name: uploadName, size: uploadBytes.length, contentType: "text/plain" }),
}), "request signed document upload");
const putResponse = await fetch(uploadDetails.uploadURL, {
  method: "PUT",
  headers: { "Content-Type": "text/plain" },
  body: uploadBytes,
});
assert.ok(putResponse.ok, `signed document upload: ${putResponse.status}`);

const invalidDocument = await request(`/matters/${matterId}/documents`, {
  method: "POST",
  body: JSON.stringify({
    title: `[REGRESSION] invalid upload ${unique}`,
    documentType: "general",
    fileObjectPath: uploadDetails.objectPath,
    originalFilename: uploadName,
    mimeType: "text/plain",
    fileSize: uploadBytes.length,
    fileChecksum: "0".repeat(64),
  }),
});
status(invalidDocument, 400, "reject checksum mismatch without creating document");
const afterInvalid = ok(await request(`/matters/${matterId}/documents`), "confirm invalid upload did not create a document");
assert.ok(!afterInvalid.some((item) => item.title === `[REGRESSION] invalid upload ${unique}`), "invalid file metadata creates no partial document");

const document = ok(await request(`/matters/${matterId}/documents`, {
  method: "POST",
  body: JSON.stringify({
    title: `[REGRESSION] document governance ${unique}`,
    documentType: "general",
    fileObjectPath: uploadDetails.objectPath,
    originalFilename: `../${uploadName}`,
    mimeType: "text/plain",
    fileSize: uploadBytes.length,
    fileChecksum: uploadChecksum,
  }),
}), "create governed document");
assert.equal(document.status, "draft", "new document starts in draft");
assert.equal(document.fileObjectPath, uploadDetails.objectPath, "object path is persisted");
assert.equal(document.originalFilename, uploadName, "filename is normalized before persistence");
assert.equal(document.fileChecksum, uploadChecksum, "checksum is persisted");

const downloadResponse = await fetch(`${baseUrl}/storage${document.fileObjectPath}`, {
  headers: { cookie },
});
assert.equal(downloadResponse.status, 200, "stored document can be retrieved");
assert.match(downloadResponse.headers.get("content-disposition") ?? "", new RegExp(uploadName), "download preserves original filename");
assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), uploadBytes, "downloaded bytes match the uploaded file");

ok(await request(`/matters/${matterId}/documents/${document.id}/status`, {
  method: "POST",
  body: JSON.stringify({ status: "review" }),
}), "move document to review");
ok(await request(`/matters/${matterId}/documents/${document.id}/submit`, {
  method: "POST",
  body: JSON.stringify({}),
}), "submit document for approval");
const approved = ok(await request(`/matters/${matterId}/documents/${document.id}/decision`, {
  method: "POST",
  body: JSON.stringify({ decision: "approve" }),
}), "approve document");
assert.equal(approved.status, "client_signing", "approval enters client signing");
const refreshedDocument = ok(await request(`/matters/${matterId}/documents/${document.id}`), "refresh governed document after approval");
assert.equal(refreshedDocument.status, "client_signing", "approved document state survives refresh");
assert.equal(refreshedDocument.approvalStatus, "approved", "approval decision survives refresh");

const versions = ok(await request(`/matters/${matterId}/documents/${document.id}/versions`), "list document versions");
const initialVersion = versions.find((version) => version.version === 1);
assert.ok(initialVersion, "initial document version is retained");
assert.equal(initialVersion.fileObjectPath, document.fileObjectPath, "version preserves file object path");
assert.equal(initialVersion.originalFilename, document.originalFilename, "version preserves original filename");
assert.equal(initialVersion.mimeType, document.mimeType, "version preserves MIME type");
assert.equal(initialVersion.fileSize, document.fileSize, "version preserves file size");
assert.equal(initialVersion.fileChecksum, document.fileChecksum, "version preserves checksum");
const audit = ok(await request(`/audit-logs?entityType=document&entityId=${document.id}`), "list document audit trail");
assert.ok(audit.some((entry) => entry.action === "document_submitted"), "submission is auditable");
status(await request(`/matters/${matterId}/documents/${document.id}/status`, {
  method: "POST",
  body: JSON.stringify({ status: "draft" }),
}), 409, "illegal lifecycle transition is blocked");

const emailKey = `phase1-regression-email-${unique}`;
const emailPayload = {
  to: "regression@example.com",
  subject: "Phase 1 regression email",
  body: "This email must remain queued until a provider confirms delivery.",
  matterId,
  reviewed: true,
  idempotencyKey: emailKey,
};
status(await request("/provider-operations/email", {
  method: "POST",
  body: JSON.stringify({ ...emailPayload, reviewed: false, idempotencyKey: `${emailKey}-unreviewed` }),
}), 400, "unreviewed email cannot be queued");
status(await request("/provider-operations/email", {
  method: "POST",
  body: JSON.stringify({ ...emailPayload, matterId: undefined, idempotencyKey: `${emailKey}-no-matter` }),
}), 400, "email requires matter context");
const queuedEmail = ok(await request("/provider-operations/email", {
  method: "POST",
  body: JSON.stringify(emailPayload),
}), "queue email operation");
assert.equal(queuedEmail.status, "queued", "email starts queued");
assert.equal(queuedEmail.providerName, "not_connected", "email does not claim a provider");
const duplicateEmail = ok(await request("/provider-operations/email", {
  method: "POST",
  body: JSON.stringify(emailPayload),
}), "repeat email operation");
assert.equal(duplicateEmail.id, queuedEmail.id, "email idempotency prevents duplicate operations");
status(await request(`/provider-operations/${queuedEmail.id}/status`, {
  method: "POST",
  body: JSON.stringify({ status: "provider_confirmed", providerName: "regression-provider", providerEventId: `missing-request-${unique}` }),
}), 400, "provider confirmation requires a provider request ID");
const failedEmail = ok(await request(`/provider-operations/${queuedEmail.id}/status`, {
  method: "POST",
  body: JSON.stringify({
    status: "failed",
    providerName: "regression-provider",
    providerEventId: `email-failed-${unique}`,
    errorMessage: "Regression provider rejected the message.",
  }),
}), "record failed email provider operation");
assert.equal(failedEmail.status, "failed", "failed provider status is persisted");
assert.match(failedEmail.errorMessage, /rejected/, "provider failure reason is persisted");
const duplicateFailure = ok(await request(`/provider-operations/${queuedEmail.id}/status`, {
  method: "POST",
  body: JSON.stringify({
    status: "failed",
    providerName: "regression-provider",
    providerEventId: `email-failed-${unique}`,
    errorMessage: "Duplicate callback must be harmless.",
  }),
}), "repeat failed provider callback");
assert.equal(duplicateFailure.id, failedEmail.id, "duplicate provider event is idempotent");
status(await request(`/provider-operations/${queuedEmail.id}/status`, {
  method: "POST",
  body: JSON.stringify({
    status: "provider_confirmed",
    providerName: "regression-provider",
    providerRequestId: `wrong-terminal-${unique}`,
    providerEventId: `email-different-${unique}`,
  }),
}), 409, "terminal provider operation cannot be overwritten");
const retriedEmail = ok(await request(`/provider-operations/${queuedEmail.id}/retry`, {
  method: "POST",
  body: JSON.stringify({}),
}), "retry failed email operation");
assert.equal(retriedEmail.status, "queued", "failed email can be requeued");
assert.equal(retriedEmail.attempt, 2, "retry creates the next deterministic attempt");
assert.equal(retriedEmail.retryOfId, queuedEmail.id, "retry preserves its source operation");
const duplicateRetry = ok(await request(`/provider-operations/${queuedEmail.id}/retry`, {
  method: "POST",
  body: JSON.stringify({}),
}), "repeat email retry");
assert.equal(duplicateRetry.id, retriedEmail.id, "repeat retry does not duplicate the operation");
const confirmedEmail = ok(await request(`/provider-operations/${retriedEmail.id}/status`, {
  method: "POST",
  body: JSON.stringify({
    status: "provider_confirmed",
    providerName: "regression-provider",
    providerRequestId: `email-request-${unique}`,
    providerEventId: `email-confirmed-${unique}`,
  }),
}), "confirm retried email provider operation");
assert.equal(confirmedEmail.status, "provider_confirmed", "provider confirmation is persisted");

const queuedSignature = ok(await request(`/matters/${matterId}/documents/${document.id}/send-signature`, {
  method: "POST",
  body: JSON.stringify({ signerName: "Regression Client", signerEmail: "regression@example.com" }),
}), "queue signature operation");
assert.equal(queuedSignature.providerOperation.status, "queued", "signature starts queued");
const queuedWorkflow = ok(await request("/workflows"), "load workflow projection for queued signature");
const queuedSignatureInstance = queuedWorkflow.instances.find((instance) => instance.entityType === "document" && instance.entityId === document.id && instance.workflowKey === "signature");
assert.equal(queuedSignatureInstance?.status, "queued", "workflow reflects queued provider state");
assert.match(queuedSignatureInstance?.blockedBy ?? "", /provider not connected/i, "workflow explains why queued signing cannot advance");
status(await request(`/matters/${matterId}/documents/${document.id}/send-signature`, {
  method: "POST",
  body: JSON.stringify({ signerName: "Regression Client" }),
}), 409, "signature cannot be re-queued after initial handoff");
status(await request(`/matters/${matterId}/documents/${document.id}/send-signature`, {
  method: "POST",
  body: JSON.stringify({ signerName: "Regression Client", signerEmail: "regression@example.com" }),
}), 409, "duplicate signature handoff is blocked");
status(await request(`/matters/${matterId}/documents/${document.id}/sign`, {
  method: "POST",
  body: JSON.stringify({ signerName: "Regression Client", signerEmail: "regression@example.com", signerMethod: "staff_verified" }),
}), 409, "signature cannot be recorded before provider confirmation");

const confirmed = ok(await request(`/provider-operations/${queuedSignature.providerOperation.id}/status`, {
  method: "POST",
  body: JSON.stringify({
    status: "provider_confirmed",
    providerName: "regression-provider",
    providerRequestId: `regression-${unique}`,
    providerEventId: `signature-confirmed-${unique}`,
  }),
}), "confirm signature provider operation");
assert.equal(confirmed.status, "provider_confirmed", "provider confirmation is persisted");
const confirmedDocument = ok(await request(`/matters/${matterId}/documents/${document.id}`), "refresh document after provider confirmation");
assert.equal(confirmedDocument.providerOperation.status, "provider_confirmed", "document exposes provider confirmation after refresh");
const confirmedWorkflow = ok(await request("/workflows"), "load workflow projection after provider confirmation");
const confirmedSignatureInstance = confirmedWorkflow.instances.find((instance) => instance.entityType === "document" && instance.entityId === document.id && instance.workflowKey === "signature");
assert.equal(confirmedSignatureInstance?.status, "provider_confirmed", "workflow distinguishes provider confirmation from client signature");
assert.equal(confirmedSignatureInstance?.currentStep, "client_signature", "workflow advances only to client signature");
const signed = ok(await request(`/matters/${matterId}/documents/${document.id}/sign`, {
  method: "POST",
  body: JSON.stringify({ signerName: "Regression Client", signerEmail: "regression@example.com", signerMethod: "staff_verified" }),
}), "record confirmed signature");
assert.equal(signed.signatureStatus, "signed", "confirmed signature reaches signed state");

console.log(`Phase 1 regression passed: matter ${matterId}, template ${template.id}, document ${document.id}, email operation ${queuedEmail.id}, signature operation ${queuedSignature.providerOperation.id}`);