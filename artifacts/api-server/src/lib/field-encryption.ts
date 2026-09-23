import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Phase O abstraction only: not enabled on persisted fields until migration is approved. */
export function encryptField(plaintext: string, context: string, keyId: string, keys: Record<string, Buffer>): string {
  const key = keys[keyId];
  if (!/^[a-zA-Z0-9_-]+$/.test(keyId) || key?.length !== 32) throw new Error("Invalid encryption key configuration");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`apz:v1:${keyId}:${context}`));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["apz", "v1", keyId, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptField(envelope: string, context: string, keys: Record<string, Buffer>): string {
  try {
    const [prefix, version, keyId, iv, tag, ciphertext, extra] = envelope.split(":");
    if (prefix !== "apz" || version !== "v1" || !keyId || extra !== undefined || ciphertext === undefined) throw new Error();
    const key = keys[keyId];
    if (key?.length !== 32 || Buffer.from(iv, "base64").length !== 12 || Buffer.from(tag, "base64").length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(`apz:v1:${keyId}:${context}`));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch { throw new Error("Unable to decrypt protected field"); }
}
