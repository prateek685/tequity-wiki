import { RED_FLAG_TEXT } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import { emailDomain } from "./email-client.js";
import { emailJobId, type EmailItem, idempotencyKey, parseEmailItem, renderManagerEmail } from "./email.js";
import { emailMode } from "./email.module.js";
import { FakeEmailClient } from "./fake-email-client.js";
import { ResendEmailClient } from "./resend-email-client.js";

const DEV = "11111111-1111-4111-8111-111111111111";
const SARA = "22222222-2222-4222-8222-222222222222";
const flag: EmailItem = {
  template: "red_flag",
  payload: {
    engineerId: SARA,
    engineerName: "Sara Khan",
    kind: "pillar_low",
    detail: "Stand firm: 2, 2, 1 (Weeks 3–5)",
  },
};
const other: EmailItem = {
  template: "red_flag",
  payload: { engineerId: DEV, engineerName: "Dev Malhotra", kind: "pillar_low", detail: "Own: 2, 2, 2" },
};

describe("renderManagerEmail", () => {
  it("lists every red flag in one short plain-text email with a portal link", () => {
    const email = renderManagerEmail({
      managerName: "Priya Nair",
      items: [flag, other],
      origin: "https://portal.example.com",
    });
    expect(email.subject).toBe("Client-Ready 90 days plan: 2 new red flags");
    expect(email.text).toContain("Hi Priya,");
    expect(email.text).toContain("Dev Malhotra: ");
    expect(email.text).toContain(
      "Sara Khan: The same pillar at 2 or below for 3 weeks (Stand firm: 2, 2, 1 (Weeks 3–5)).",
    );
    expect(email.text).not.toContain(RED_FLAG_TEXT.pillar_low.action);
    expect(email.text).toContain("https://portal.example.com/manager/red-flags");
    expect(email.text).not.toContain("coming due");
  });

  it("also renders an HTML version: escaped names, the guide's text, one button into the portal", () => {
    const tricky: EmailItem = {
      template: "red_flag",
      payload: { ...flag.payload, engineerName: "Sara <b>Khan</b> & Co" },
    };
    const { html } = renderManagerEmail({
      managerName: "Priya Nair",
      items: [tricky, other],
      origin: "https://p.test",
    });
    expect(html).toContain("Hi Priya,");
    expect(html).toContain("Sara &#60;b&#62;Khan&#60;/b&#62; &#38; Co");
    expect(html).not.toContain("<b>Khan</b>");
    expect(html).toContain(RED_FLAG_TEXT.pillar_low.signal);
    expect(html).not.toContain(RED_FLAG_TEXT.pillar_low.action);
    expect(html).not.toContain("What it may mean");
    expect(html.match(/href="https:\/\/p\.test\/manager\/red-flags"/g)).toHaveLength(1);
    expect(html).toContain("Review and acknowledge");
    expect(html).toContain("in the Client-Ready 90 days plan");
  });

  it("says 'a red flag' in the singular and greets 'there' without a name", () => {
    const email = renderManagerEmail({ managerName: "", items: [flag], origin: "http://x" });
    expect(email.subject).toBe("Client-Ready 90 days plan: 1 new red flag");
    expect(email.text).toContain("Hi there,");
  });
});

describe("items and jobs", () => {
  it("parses stored items and rejects broken ones", () => {
    expect(parseEmailItem(flag)).toEqual(flag);
    expect(parseEmailItem({ template: "checkin_due", payload: {} })).toBeNull();
    expect(parseEmailItem({ template: "red_flag", payload: { engineerId: DEV } })).toBeNull();
    expect(parseEmailItem({ template: "welcome", payload: {} })).toBeNull();
  });

  it("gives the same idempotency key for the same items in any order", () => {
    expect(idempotencyKey(["b", "a"])).toBe(idempotencyKey(["a", "b"]));
    expect(idempotencyKey(["a"])).not.toBe(idempotencyKey(["a", "b"]));
  });

  it("gives one job id per manager and hour", () => {
    const at = new Date("2026-10-11T10:05:00Z");
    expect(emailJobId(DEV, at)).toBe(emailJobId(DEV, new Date("2026-10-11T10:59:59Z")));
    expect(emailJobId(DEV, at)).not.toBe(emailJobId(DEV, new Date("2026-10-11T11:00:00Z")));
    expect(emailJobId(DEV, at)).not.toContain(":");
  });
});

describe("clients", () => {
  it("chooses Resend only with a key and a sender; no fake in production", () => {
    const env = { NODE_ENV: "development" as const, RESEND_API_KEY: "", EMAIL_FROM: "" };
    expect(emailMode(env)).toBe("fake");
    expect(emailMode({ ...env, RESEND_API_KEY: "re_x" })).toBe("fake");
    expect(emailMode({ ...env, RESEND_API_KEY: "re_x", EMAIL_FROM: "Portal <p@x.com>" })).toBe("resend");
    expect(emailMode({ ...env, NODE_ENV: "production" })).toBe("off");
  });

  it("the fake logs the recipient's domain and templates only", async () => {
    const logs: { fields: Record<string, unknown>; message: string }[] = [];
    const fake = new FakeEmailClient({ info: (fields, message) => logs.push({ fields, message }) });
    await fake.send({
      to: "priya@test.local",
      subject: "S",
      text: "Secret body",
      html: "<p>Secret body</p>",
      templates: ["red_flag", "red_flag"],
      idempotencyKey: "k",
    });
    expect(logs).toEqual([
      { fields: { to: "test.local", templates: ["red_flag"] }, message: "email queued" },
    ]);
    expect(JSON.stringify(logs)).not.toContain("Secret body");
    expect(JSON.stringify(logs)).not.toContain("priya@");
    expect(fake.outbox).toHaveLength(1);
    expect(emailDomain("A@Example.COM")).toBe("example.com");
  });

  it("Resend gets one POST with the idempotency key, and errors carry the status only", async () => {
    const calls: { url: string; headers: unknown; body: string }[] = [];
    let status = 200;
    const fetcher: typeof fetch = (url, init) => {
      calls.push({
        url: url instanceof Request ? url.url : url.toString(),
        headers: init?.headers,
        body: typeof init?.body === "string" ? init.body : "",
      });
      return Promise.resolve(new Response("{}", { status }));
    };
    const client = new ResendEmailClient("re_key", "Portal <p@x.com>", fetcher);
    const message = {
      to: "m@x.com",
      subject: "S",
      text: "T",
      html: "<p>T</p>",
      templates: ["red_flag"],
      idempotencyKey: "k1",
    };
    await client.send(message);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.headers).toMatchObject({ Authorization: "Bearer re_key", "Idempotency-Key": "k1" });
    expect(JSON.parse(calls[0]?.body ?? "")).toEqual({
      from: "Portal <p@x.com>",
      to: ["m@x.com"],
      subject: "S",
      text: "T",
      html: "<p>T</p>",
    });
    status = 500;
    await expect(client.send(message)).rejects.toThrow("Resend responded 500");
  });
});
