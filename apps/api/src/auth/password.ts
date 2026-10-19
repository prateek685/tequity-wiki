import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
// N=2^15 is OWASP's scrypt minimum; maxmem must cover 128 * N * r bytes.
const COST = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, COST, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Stored form: `scrypt$<salt hex>$<key hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await derive(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A hash nobody knows the password for: checked when the email is unknown, so timing doesn't reveal it. */
export const UNKNOWN_ACCOUNT_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(KEY_LENGTH)}`;
