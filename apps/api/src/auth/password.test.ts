import { describe, expect, it } from "vitest";
import { hashPassword, UNKNOWN_ACCOUNT_HASH, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("accepts the right password and rejects others", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("salts every hash and rejects malformed ones", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", UNKNOWN_ACCOUNT_HASH)).toBe(false);
  });
});
