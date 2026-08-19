import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "./field-encryption";

describe("field encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips sensitive text", () => {
    const encrypted = encryptField("refresh-token-value", key);

    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptField(encrypted, key)).toBe("refresh-token-value");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptField("secret", key);
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    expect(() => decryptField(tampered, key)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptField("secret", Buffer.from("short").toString("base64"))).toThrow(
      "FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  });
});
