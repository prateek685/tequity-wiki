import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./email.js";

describe("isAllowedEmail", () => {
  it("accepts only the company domain, case-insensitively", () => {
    expect(isAllowedEmail("Aarav@Company.com", "company.com")).toBe(true);
    expect(isAllowedEmail("aarav@company.com", "@company.com")).toBe(true);
  });

  it("rejects other domains, look-alikes and malformed addresses", () => {
    expect(isAllowedEmail("aarav@gmail.com", "company.com")).toBe(false);
    expect(isAllowedEmail("aarav@evilcompany.com", "company.com")).toBe(false);
    expect(isAllowedEmail("aarav@company.com.evil.io", "company.com")).toBe(false);
    expect(isAllowedEmail("a@b@company.com", "company.com")).toBe(false);
    expect(isAllowedEmail("@company.com", "company.com")).toBe(false);
    expect(isAllowedEmail("", "company.com")).toBe(false);
    expect(isAllowedEmail(null, "company.com")).toBe(false);
  });
});
