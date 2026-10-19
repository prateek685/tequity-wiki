import { z } from "zod";
import { cardPublic, libraryEntry } from "./content.js";

/**
 * The Library (docs/PORTAL_PLAN.md §8 "Library"): frameworks, templates (A1–A13), AI prompts (B1–B8),
 * the glossary, resources and every mock card's public side. Read-only, for any signed-in user.
 */

/** GET /api/library — every entry (with its blocks) and the mock cards, in content order. */
export const libraryResponse = z.object({
  entries: z.array(libraryEntry),
  cards: z.array(cardPublic.extend({ day: z.number().int().nullable() })),
});
export type LibraryResponse = z.infer<typeof libraryResponse>;
