// Resolves a single, valid Content-Type for an uploaded File and guarantees the
// same value is used for (a) the presigned-URL request body, (b) the PUT
// Content-Type header (which must match the signed value exactly), and
// (c) the document mimeType recorded in the database.
//
// Browsers do not always report file.type (e.g. empty string for .docx on some
// platforms), so we derive the type from the file extension first and fall back
// to the context-appropriate default. Every returned value is a member of the
// server's StorageUploadRequest contentType enum, so the request is always valid.

import type { StorageUploadRequestContentType } from "@workspace/api-client-react";

export const ALLOWED_UPLOAD_CONTENT_TYPES: readonly StorageUploadRequestContentType[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/plain",
  "application/vnd.oasis.opendocument.text",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  txt: "text/plain",
  odt: "application/vnd.oasis.opendocument.text",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_UPLOAD_CONTENT_TYPES);

export function resolveUploadContentType(file: File, fallback: StorageUploadRequestContentType): StorageUploadRequestContentType {
  if (!ALLOWED_SET.has(fallback)) {
    throw new Error(`resolveUploadContentType: fallback content type must be a valid upload type: ${fallback}`);
  }
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (ext && ALLOWED_SET.has(EXT_TO_CONTENT_TYPE[ext])) {
    return EXT_TO_CONTENT_TYPE[ext] as StorageUploadRequestContentType;
  }
  if (file.type && ALLOWED_SET.has(file.type)) {
    return file.type as StorageUploadRequestContentType;
  }
  return fallback as StorageUploadRequestContentType;
}

