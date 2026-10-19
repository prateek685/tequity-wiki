import { LIBRARY_KIND_LABELS, LIBRARY_KINDS, type LibraryResponse } from "@portal/contracts";

/** Library sections, in the mockup's order: the five content kinds, then the mock cards. */
export const LIBRARY_SECTIONS = [...LIBRARY_KINDS, "cards"] as const;
export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];

export const SECTION_LABELS: Record<LibrarySection, string> = { ...LIBRARY_KIND_LABELS, cards: "Mock cards" };

export function isLibrarySection(value: string): value is LibrarySection {
  return (LIBRARY_SECTIONS as readonly string[]).includes(value);
}

/** One row of the Library index: the section, a few of its titles ("What's inside") and how many. */
export function sectionRows(
  data: LibraryResponse,
): { section: LibrarySection; label: string; inside: string; count: number }[] {
  const titles = (section: LibrarySection): string[] =>
    section === "cards"
      ? data.cards.map((card) => `${card.id} ${card.title}`)
      : data.entries.filter((entry) => entry.kind === section).map((entry) => entry.title);
  return LIBRARY_SECTIONS.map((section) => {
    const all = titles(section);
    const shown = all.slice(0, 5).join(", ");
    return {
      section,
      label: SECTION_LABELS[section],
      inside: all.length > 5 ? `${shown} …` : shown,
      count: all.length,
    };
  });
}
