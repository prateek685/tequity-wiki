import { createHash } from "node:crypto";
import { RED_FLAG_KINDS, RED_FLAG_TEXT } from "@portal/contracts";
import { type JobsOptions } from "bullmq";
import { z } from "zod";

/**
 * Manager emails (docs/PORTAL_PLAN.md §3 "Emails"): the pure parts. One item template, `red_flag` (a newly
 * raised flag), to the managers of the engineer's team. Items are saved `pending` in email_log with a
 * unique dedupe key per item and manager; one email per manager lists every pending item, so nothing is
 * sent twice. Engineers get no email, and neither is a check-in: the engineer books those themselves.
 */

export const emailItem = z.object({
  template: z.literal("red_flag"),
  payload: z.object({
    engineerId: z.uuid(),
    engineerName: z.string(),
    kind: z.enum(RED_FLAG_KINDS),
    detail: z.string(),
  }),
});
export type EmailItem = z.infer<typeof emailItem>;

/** A pending email_log row → an item, or null when it doesn't parse (it is marked failed). */
export function parseEmailItem(row: { template: string; payload: unknown }): EmailItem | null {
  const parsed = emailItem.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export interface ManagerEmail {
  subject: string;
  /** Plain-text version (for clients that don't show HTML). */
  text: string;
  html: string;
}

// Email clients ignore stylesheets and CSS variables, so the HTML carries inline styles. The values are
// the portal's light-theme tokens (apps/web/src/styles/globals.css).
const INK = "#1c1b19";
const INK_2 = "#3d3a36";
const MUTED = "#6e6a64";
const LINE = "#e5e4e1";
const PAGE = "#f2f2f0";
const ACCENT = "#c2410c";
const FONT = "Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** The one course there is for now (the same name as the wiki home card). */
const COURSE = "Client-Ready 90 days plan";

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

type RedFlagPayload = EmailItem["payload"];

function flagBlock(item: RedFlagPayload): string {
  const text = RED_FLAG_TEXT[item.kind];
  return `<tr><td style="padding:0 0 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;border-left:4px solid ${ACCENT};">
<tr><td style="padding:16px 18px;font-family:${FONT};color:${INK};">
<p style="margin:0 0 2px;font-size:16px;font-weight:600;">${escapeHtml(item.engineerName)}</p>
<p style="margin:0;font-size:14px;line-height:21px;color:${INK_2};">${escapeHtml(text.signal)}<br><span style="color:${MUTED};">${escapeHtml(item.detail)}</span></p>
</td></tr></table></td></tr>`;
}

/**
 * One manager's email: the new red flags (the PDF's signal, with the numbers behind it) and a button into
 * the portal, where the meaning and the management action are shown. Sent as HTML with a plain-text version beside it.
 */
export function renderManagerEmail(input: {
  managerName: string;
  items: readonly EmailItem[];
  origin: string;
}): ManagerEmail {
  const flags = input.items.map((item) => item.payload);
  const firstName = input.managerName.trim().split(/\s+/)[0] ?? "";
  const greeting = `Hi ${firstName || "there"},`;
  const subject = `${COURSE}: ${plural(flags.length, "new red flag")}`;
  const link = `${input.origin}/manager/red-flags`;

  const lines: string[] = [greeting, "", `New red flags in the ${COURSE}:`];
  for (const item of flags) {
    const text = RED_FLAG_TEXT[item.kind];
    lines.push(`- ${item.engineerName}: ${text.signal} (${item.detail}).`);
  }
  lines.push("", `Review and acknowledge: ${link}`, "", "Tequity.wiki");

  const intro =
    flags.length === 1
      ? `A new red flag was raised for someone on your team in the ${COURSE}.`
      : `New red flags were raised for people on your team in the ${COURSE}.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 4px 16px;font-family:${FONT};font-size:18px;font-weight:700;color:${INK};">Tequity<span style="color:${ACCENT};">.wiki</span><span style="font-weight:400;color:${MUTED};"> &nbsp;·&nbsp; ${COURSE}</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:28px 26px;font-family:${FONT};color:${INK};">
<p style="margin:0 0 6px;font-size:20px;line-height:28px;font-weight:600;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:23px;color:${INK_2};">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${flags.map(flagBlock).join("")}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 4px;"><tr><td style="background:${ACCENT};border-radius:8px;">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Review and acknowledge</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">You get this because you manage a team in the ${COURSE} on Tequity.wiki. Engineers are not emailed.</td></tr>
</table></td></tr></table>
</body></html>`;
  return { subject, text: lines.join("\n"), html };
}

/** The same set of items always gives the same key (Resend drops a repeated send). */
export function idempotencyKey(itemIds: readonly string[]): string {
  return `portal-${createHash("sha256")
    .update([...itemIds].sort().join(","))
    .digest("hex")
    .slice(0, 40)}`;
}

/** What an email job carries: the recipient's id only. */
export const emailJob = z.object({ recipientId: z.uuid() });
export type EmailJob = z.infer<typeof emailJob>;

/** One job per manager and run (the hour), so a rerun in the same hour doesn't queue a second one. */
export function emailJobId(recipientId: string, now: Date): string {
  return `email-${recipientId}-${Math.floor(now.getTime() / 3_600_000)}`;
}

/** 4 attempts with backoff (1, 2, 4 minutes); after the last one the items are marked failed. */
export const EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: 500,
  removeOnFail: 500,
};
