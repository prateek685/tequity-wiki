import { type Pillar, type ReadinessModel } from "@portal/contracts";

/**
 * The call rubric the manager scores at a gate (criteria 1–11, docs/PORTAL_PLAN.md §3 "Call rubric" and
 * "Gate pass bars"). The engineer's player gets it from the readiness model (`model.rubric`, from
 * content/plan.yaml), but no manager or gate endpoint sends the model, so the gate screens use this copy.
 * Keep it in step with content/plan.yaml `rubric:`.
 *
 * Approved criterion → pillar mapping (PORTAL_PLAN §3): 1, 2, 6 Communicate · 3, 4, 5 Understand ·
 * 8, 10, 11 Own · 7, 9 Stand firm.
 */
export const GATE_RUBRIC: ReadinessModel["rubric"] = [
  {
    number: 1,
    name: "Opening and agenda",
    pillar: "communicate",
    anchors: {
      one: "Starts abruptly, or waits for the client to lead",
      three: "Greets the client, states the purpose and agenda",
      five: "Warm start, clear purpose, invites the client's input, checks the time",
    },
  },
  {
    number: 2,
    name: "Answer-first structure",
    pillar: "communicate",
    anchors: {
      one: "Background first, answer buried",
      three: "Answer first most of the time",
      five: "Always answer first, with 2–3 clear points; concise",
    },
  },
  {
    number: 3,
    name: "Questions asked",
    pillar: "understand",
    anchors: {
      one: "Few or none; mostly yes/no",
      three: "Several open questions; some follow-up",
      five: "Uncovers the real goal and success metric with a clear question funnel",
    },
  },
  {
    number: 4,
    name: "Playback",
    pillar: "understand",
    anchors: {
      one: "None",
      three: "Plays back at the end",
      five: "Plays back at key moments and confirms understanding",
    },
  },
  {
    number: 5,
    name: "Business link",
    pillar: "understand",
    anchors: {
      one: "Only technical talk",
      three: "Sometimes mentions business impact",
      five: "Every key point tied to a client outcome or metric",
    },
  },
  {
    number: 6,
    name: "Trade-offs",
    pillar: "communicate",
    anchors: {
      one: "Options with no recommendation, or jargon",
      three: "Clear options and a recommendation",
      five: "Simple, business-framed trade-off; the client decides quickly",
    },
  },
  {
    number: 7,
    name: "Handling unknowns",
    pillar: "stand_firm",
    anchors: {
      one: "Guesses, freezes, or over-apologises",
      three: "Admits it and commits to follow up",
      five: "Calm; shares what is known; gives a clear follow-up time",
    },
  },
  {
    number: 8,
    name: "Risks and bad news",
    pillar: "own",
    anchors: {
      one: "Hides or delays it",
      three: "Raises it when asked",
      five: "Raises it proactively, with impact, options, and the next update time",
    },
  },
  {
    number: 9,
    name: "Disagreement",
    pillar: "stand_firm",
    anchors: {
      one: "Silently agrees, or argues",
      three: "States the concern politely",
      five: "Acknowledges their goal, uses facts, offers an alternative, reaches agreement",
    },
  },
  {
    number: 10,
    name: "Closing and next steps",
    pillar: "own",
    anchors: {
      one: "Ends without next steps",
      three: "Lists the next steps",
      five: "Recaps decisions, owners and dates; ends on time",
    },
  },
  {
    number: 11,
    name: "Written follow-up",
    pillar: "own",
    anchors: {
      one: "None, or late",
      three: "Sent the same day",
      five: "Sent within 2 hours; bottom line first; action items with owners and dates",
    },
  },
];

/** Criterion number → pillar, for `gatePillarAverages`. */
export function criterionPillars(rubric: ReadinessModel["rubric"] = GATE_RUBRIC): Record<number, Pillar> {
  return Object.fromEntries(rubric.map((criterion) => [criterion.number, criterion.pillar]));
}
