// Integration tests for the object-storage upload flow:
//   POST /api/storage/uploads/request-url  (presigned URL + signed Content-Type)
//   PUT <uploadURL> with the signed Content-Type            (browser upload)
//   POST /matters/:matterId/documents                       (persist metadata)
//   GET  /api/storage/objects/uploads/:uuid                 (download)
//
// Mirrors the style of scripts/phase1-regression.mjs. Run against a live API:
//   APZ_API_URL=http://127.0.0.1:3002/api APZ_TEST_EMAIL=... APZ_TEST_PASSWORD=... \
//     node scripts/test-storage-upload.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";

const baseUrl = process.env.APZ_API_URL || "http://127.0.0.1:8080/api";
const email = process.env.APZ_TEST_EMAIL || "admin@apzlegal.co.za";
const password = process.env.APZ_TEST_PASSWORD || "password123";
let cookie = "";

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
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

// 1) Upload URL cannot be requested without authentication.
status(await request("/storage/uploads/request-url", {
  method: "POST",
  body: JSON.stringify({ name: "unauthorized.pdf", size: 1, contentType: "application/pdf" }),
}), 401, "unauthenticated upload URL request is rejected");

// 2) Authenticate as staff.
ok(await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
}), "staff login");
assert.ok(cookie, "staff login produced a session cookie");

// 3) Invalid contentType is rejected by the server schema (400).
status(await request("/storage/uploads/request-url", {
  method: "POST",
  body: JSON.stringify({ name: "bad.pdf", size: 10, contentType: "application/evil" }),
}), 400, "invalid contentType is rejected");

// 4) Valid request returns a signed URL, normalized object path and echoed contentType.
const requestBody = ok(await request("/storage/uploads/request-url", {
  method: "POST",
  body: JSON.stringify({ name: "matter-document.pdf", size: 20, contentType: "application/pdf" }),
}), "request upload URL");
assert.match(requestBody.uploadURL, /^https?:\/\//, "uploadURL is an absolute presigned URL");
assert.match(requestBody.objectPath, /^\/objects\/uploads\/[0-9a-f-]{36}$/, `objectPath is /objects/uploads/<uuid>: ${requestBody.objectPath}`);
assert.equal(requestBody.metadata.contentType, "application/pdf", "metadata.contentType echoes the signed value");
const uuid = requestBody.objectPath.split("/").pop();

// 5) The browser upload must use the signed Content-Type exactly.
const fileBytes = Buffer.from("%PDF-1.4 matter-document-bytes");
const put = await fetch(requestBody.uploadURL, {
  method: "PUT",
  headers: { "Content-Type": requestBody.metadata.contentType },
  body: fileBytes,
});
assert.equal(put.status, 200, `PUT with signed Content-Type should succeed: ${put.status} ${await put.text()}`);

// 6) Persist as a matter document referencing the uploaded object path.
const checksum = crypto.createHash("sha256").update(fileBytes).digest("hex");
const mattersList = ok(await request("/matters"), "list matters");
assert.ok(mattersList.length > 0, "regression requires at least one matter");
const matterId = mattersList[0].id;

const created = ok(await request(`/matters/${matterId}/documents`, {
  method: "POST",
  body: JSON.stringify({
    title: "Storage upload regression document",
    documentType: "contract",
    fileObjectPath: requestBody.objectPath,
    originalFilename: "matter-document.pdf",
    mimeType: requestBody.metadata.contentType,
    fileSize: fileBytes.length,
    fileChecksum: checksum,
  }),
}), "create matter document from uploaded object");
assert.ok(created.id, "document was created");

// 7) Download the stored object through the private object path.
const dlResponse = await fetch(`${baseUrl}/storage/objects/uploads/${uuid}`, {
  headers: { cookie },
  redirect: "manual",
});
const dlBuf = Buffer.from(await dlResponse.arrayBuffer());
assert.equal(dlResponse.status, 200, `download object should be 200: ${dlBuf.slice(0, 200).toString()}`);
assert.deepEqual(dlBuf, fileBytes, "downloaded bytes match uploaded bytes");
assert.match(dlResponse.headers.get("content-type") || "", /application\/pdf/, "downloaded content-type matches the signed value");

console.log(`\nStorage upload→persist→download cycle passed for a matter document (${matterId}/${created.id}).`);
console.log("VERIFIED: signed Content-Type == browser upload Content-Type == stored Content-Type == recorded mimeType");
