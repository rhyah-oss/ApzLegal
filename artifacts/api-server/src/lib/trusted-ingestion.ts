import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
export function trustedIngestion(supplied: unknown, secret: string | undefined): boolean {
  return typeof supplied === "string" && !!secret && secret.length >= 32 &&
    Buffer.byteLength(supplied) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
const text = z.string().max(1000000).optional();
export const InboundEmailBody = z.object({
  provider: z.string().trim().min(1).max(100),
  externalMessageId: z.string().min(1).max(1000), externalThreadId: z.string().min(1).max(1000),
  direction: z.enum(["inbound", "outbound"]).optional(), senderEmail: z.string().email(), senderName: z.string().max(255).optional(),
  toRecipients: z.array(z.string().email()).max(100).optional(), ccRecipients: z.array(z.string().email()).max(100).optional(), bccRecipients: z.array(z.string().email()).max(100).optional(),
  subject: z.string().max(2000).optional(), bodyText: text, bodyHtml: text,
  headers: z.record(z.string().max(10000)).optional(),
  receivedAt: z.string().datetime({ offset: true }).transform(value => new Date(value)),
  sentAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).optional(),
  attachments: z.array(z.object({
    externalAttachmentId: z.string().max(1000).optional(), filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255), fileSize: z.number().int().nonnegative().max(25 * 1024 * 1024),
    fileChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  }).strict()).max(100).optional(),
}).strict();
