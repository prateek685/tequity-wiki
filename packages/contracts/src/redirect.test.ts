import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect.js";

const origin = "https://portal.company.com";

describe("safeRedirectPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeRedirectPath("/manager", origin)).toBe("/manager");
    expect(safeRedirectPath("/app/day/3?step=quiz#q2", origin)).toBe("/app/day/3?step=quiz#q2");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/%5Cevil.com\\",
    "\\\\evil.com",
    "https://evil.com",
    "http:evil.com",
    "javascript:alert(1)",
    "/\u0009/evil.com",
    "/\nevil",
    "",
    "manager",
  ])("rejects %j", (candidate) => {
    expect(safeRedirectPath(candidate, origin)).toBe("/");
  });

  it("rejects non-strings and very long values", () => {
    expect(safeRedirectPath(null, origin)).toBe("/");
    expect(safeRedirectPath(["/app"], origin)).toBe("/");
    expect(safeRedirectPath(`/${"a".repeat(3000)}`, origin)).toBe("/");
  });

  it("normalises an encoded backslash into a harmless same-site path", () => {
    // "/%5Cevil.com" is the literal path "/\evil.com" on our own site: allowed, but never leaves it.
    expect(safeRedirectPath("/%5Cevil.com", origin)).toBe("/%5Cevil.com");
  });
});
