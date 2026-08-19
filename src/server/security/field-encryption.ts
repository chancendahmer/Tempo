import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function encryptField(plaintext: string, encodedKey: string): string {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptField(payload: string, encodedKey: string): string {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext, ...extra] = payload.split(".");
  if (version !== VERSION || !encodedIv || !encodedAuthTag || !encodedCiphertext || extra.length > 0) {
    throw new Error("Unsupported or malformed encrypted field");
  }

  const key = decodeKey(encodedKey);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
