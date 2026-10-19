import { PILLARS, type Pillar, type PillarScores } from "@portal/contracts";
import { PILLAR_NAMES } from "../progress/progress";

/** Home cards from GET /api/me/home (docs/design/final-mockup.html `home()`). Pure: unit-tested. */

export interface BaselineRow {
  pillar: Pillar;
  name: string;
  /** "3.5", or "—" for a pillar without a rating. */
  value: string;
  /** Meter fill, 0–100 (a 1–5 score × 20, as in the mockup). */
  percent: number;
}

export function baselineRows(baseline: PillarScores): BaselineRow[] {
  return PILLARS.map((pillar) => {
    const score = baseline[pillar];
    return {
      pillar,
      name: PILLAR_NAMES[pillar],
      value: score === null ? "—" : score.toFixed(1),
      percent: score === null ? 0 : score * 20,
    };
  });
}

/** A feedback row's link: an app path from the API, else the Progress page (never another origin). */
export function appHref(href: string): string {
  return href.startsWith("/app") && !href.startsWith("//") ? href : "/app/progress";
}
