import { z } from "zod";

/** Plain calendar date (YYYY-MM-DD), e.g. from a date picker. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD).");

/** Timestamps travel as ISO 8601 strings with an offset. */
export const isoDateTime = z.iso.datetime({ offset: true });

export const PAGE_SIZE = 50;

/** `?page=` query value; anything invalid becomes page 1. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type PageQuery = z.infer<typeof pageQuery>;

export const idParam = z.object({ id: z.uuid() });

export const personRef = z.object({ id: z.uuid(), name: z.string() });
export type PersonRef = z.infer<typeof personRef>;

/** Green: on track · Amber: one pillar behind, plan agreed · Red: off track or a red flag (PDF §5.2). */
export const RAG = ["green", "amber", "red"] as const;
export type Rag = (typeof RAG)[number];
