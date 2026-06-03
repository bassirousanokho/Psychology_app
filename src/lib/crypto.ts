import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag (GCM default)
const ENCRYPTED_PREFIX = "enc:";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY environment variable is not set");
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return buf;
}

/**
 * Encrypts a UTF-8 string with AES-256-GCM.
 * Returns a string in the format: enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
 * The "enc:" prefix lets callers detect encrypted values for safe migration.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value produced by encrypt().
 * Returns plaintext as-is if it doesn't have the enc: prefix (migration safety).
 * Returns null if input is null/undefined.
 */
export function decrypt(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value; // plaintext passthrough

  const payload = value.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Returns true if the value is encrypted (has the enc: prefix). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}
