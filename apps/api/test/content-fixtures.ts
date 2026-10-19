import pg from "pg";

/**
 * A tiny lesson set for Days 1–2 (the readiness model, block 1, card X99, five Day 1 questions plus one
 * retired, and a 12-question Day-5 assessment pool), written with the owner connection. `learning.unlockAll` is turned off meanwhile. Content tables are global, so real imported rows for
 * the plan, block 1 and Days 1–2 are saved first and put back by `restore()`, and the real Day 1–2 and
 * assessment-05 questions are retired meanwhile so the daily quiz draws only fixture questions. Fixture questions use ids
 * D01-91…D01-96 and the card X99, which real content never uses. (If a run is interrupted,
 * `pnpm content:import` puts the real rows back.)
 */

export const CARD_ID = "X99";
export const CARD_PROMPT = "You are the client in a test mock. Stay in character.";
/** The 14 behaviour ids of the readiness model (the fixture plan uses the real ids). */
export const BEHAVIOUR_IDS = [
  "U1",
  "U2",
  "U3",
  "U4",
  "C1",
  "C2",
  "C3",
  "C4",
  "O1",
  "O2",
  "O3",
  "O4",
  "S1",
  "S2",
];
export const CHECKS = ["Answered first.", "Named the risk."];
/** Day 1 lessons in order (see `lessons(1)`). */
export const DAY1_LESSONS = ["meet", "call", "after-call", "baseline"] as const;
/** Day 2 lessons in order. */
export const DAY2_LESSONS = ["look-back", "rewrite", "friday"] as const;
/** Day 2's AI scoring guide (`content_days.write_scoring`): the "rewrite" lesson (source `both`). */
export const WRITE_SCORING = {
  rewrite: {
    modelAnswer: "The release ships Friday; the login fix is done.",
    scoringPoints: ["Gives the release date first", "Names the login fix"],
  },
};
export const QUESTION_IDS = ["D01-91", "D01-92", "D01-93", "D01-94", "D01-95"] as const;
/** A retired fixture question: kept for old quiz items, never picked for a new quiz. */
export const RETIRED_QUESTION_ID = "D01-96";

const quote = { quote: "A quoted passage from the plan.", page: 12 };
const options = (correct: number) =>
  [0, 1, 2, 3].map((i) => ({
    text: `Option ${i + 1}`,
    correct: i === correct,
    explanation: `Why option ${i + 1}.`,
  }));

export const QUESTIONS = [
  { id: "D01-91", type: "mcq", stem: "Test question one?", options: options(1), source: quote },
  { id: "D01-92", type: "mcq", stem: "Test question two?", options: options(2), source: quote },
  { id: "D01-93", type: "mcq", stem: "Test question three?", options: options(0), source: quote },
  {
    id: "D01-94",
    type: "scenario",
    stem: "What do you say?",
    clientLine: "Why is this late?",
    options: options(3),
    source: quote,
  },
  {
    id: "D01-95",
    type: "written",
    stem: "Write a short answer.",
    modelAnswer: "A model answer for the test.",
    scoringPoints: ["Point one", "Point two"],
    source: quote,
  },
] as const;

/**
 * The Day-5 assessment pool: 7 mcq + 2 scenario + 3 written (ids A05-81…A05-92), so attempt 1 uses
 * 10 of them and a retake gets the one fresh mcq and the fresh written first. Choice answers: the
 * correct option is always index 1.
 */
export const ASSESSMENT_QUESTIONS = [
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `A05-${81 + i}`,
    type: "mcq",
    stem: `Assessment question ${i + 1}?`,
    options: options(1),
    source: quote,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `A05-${88 + i}`,
    type: "scenario",
    stem: `Assessment scenario ${i + 1}?`,
    clientLine: "Is it on track?",
    options: options(1),
    source: quote,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `A05-${90 + i}`,
    type: "written",
    stem: `Assessment written ${i + 1}.`,
    modelAnswer: "A model answer.",
    scoringPoints: ["Point one", "Point two"],
    source: quote,
  })),
];
export const ASSESSMENT_CORRECT_CHOICE = 1;

const RETIRED_QUESTION = {
  id: RETIRED_QUESTION_ID,
  type: "written",
  stem: "A retired question.",
  modelAnswer: "Never asked again.",
  scoringPoints: ["Point"],
  source: quote,
};

const ALL_FIXTURE_QUESTION_IDS = [
  ...QUESTION_IDS,
  RETIRED_QUESTION_ID,
  ...ASSESSMENT_QUESTIONS.map((q) => q.id),
];

const BLOCK = { number: 1, title: "Test block", phase: 1, goal: "Test goal." };

const PILLAR_OF = { U: "understand", C: "communicate", O: "own", S: "stand_firm" } as const;
const PLAN = {
  phases: [
    { number: 1, name: "One", fromDay: 1, toDay: 20 },
    { number: 2, name: "Two", fromDay: 21, toDay: 40 },
    { number: 3, name: "Three", fromDay: 41, toDay: 65 },
  ],
  pillars: Object.values(PILLAR_OF).map((id) => ({ id, name: id, summary: `About ${id}.` })),
  behaviours: BEHAVIOUR_IDS.map((id) => ({
    id,
    pillar: PILLAR_OF[id[0] as keyof typeof PILLAR_OF],
    name: `Behaviour ${id}`,
    soundsLike: "Sounds like this.",
    watchOut: "Not like this.",
  })),
  scale: [1, 2, 3, 4, 5].map((score) => ({ score, meaning: `Meaning ${score}.` })),
  rubric: Array.from({ length: 11 }, (_, i) => ({
    number: i + 1,
    name: `Criterion ${i + 1}`,
    pillar: "own",
    anchors: { one: "Needs work.", three: "Solid.", five: "Excellent." },
  })),
};

const LESSON = {
  blocks: [],
  fields: [],
  checks: [],
  rubric: false,
  brief: true,
  baseline: false,
  scorecard: [],
  source: "carebook",
  shareReadiness: false,
};
const field = (id: string, required: boolean) => ({ id, label: id, kind: "area", placeholder: "", required });

function lessons(day: 1 | 2) {
  if (day === 1) {
    return [
      { ...LESSON, id: "meet", kind: "read", title: "Meet CareBook", minutes: "8 min" },
      {
        ...LESSON,
        id: "call",
        kind: "mock",
        title: "Baseline call",
        minutes: "15 min",
        cardId: CARD_ID,
        level: 1,
      },
      {
        ...LESSON,
        id: "after-call",
        kind: "reflect",
        title: "After the call",
        minutes: "5 min",
        fields: [field("went-well", true), field("fix-next", false)],
        checksTitle: "On this call, I…",
        checks: CHECKS,
        rubric: true,
      },
      { ...LESSON, id: "baseline", kind: "rate", title: "Your baseline", minutes: "10 min", baseline: true },
    ];
  }
  return [
    {
      ...LESSON,
      id: "look-back",
      kind: "read",
      title: "Look back",
      minutes: "3 min",
      blocks: [
        {
          type: "recall",
          label: "Your Day 1 notes",
          day: 1,
          lesson: "after-call",
          fields: [
            { id: "went-well", label: "What went well" },
            { id: "fix-next", label: "Fix next" },
          ],
        },
      ],
    },
    {
      ...LESSON,
      id: "rewrite",
      kind: "write",
      title: "Rewrite",
      minutes: "10 min",
      fields: [field("answer", true), field("extra", false)],
      source: "both",
    },
    {
      ...LESSON,
      id: "friday",
      kind: "scorecard",
      title: "Scorecard",
      minutes: "5 min",
      scorecard: ["C1", "C4"],
    },
  ];
}

const CARD = {
  id: CARD_ID,
  title: "Test card",
  client: "Test Person",
  clientRole: "VP, Test Co",
  clientInitials: "TP",
  clientPronoun: "She",
  clientMood: "In a hurry.",
  level: 1,
  minutes: "10 min",
  storySoFar: "A situation.",
  facts: [{ label: "Main risk", value: "A risk.", warn: true }],
  yourGoal: "A goal.",
  mayAsk: [],
  script: [],
  whatGood: [],
};

/** Gate 2 fixture: card X98 (the Phase 2 scenario) and Days 36–40 in block 8 (`installPhaseTwo`). */
export const PHASE_TWO_CARD_ID = "X98";
export const PHASE_TWO_DAYS = [36, 37, 38, 39, 40] as const;
/** Day 40's Friday scorecard behaviours (U → understand, S → stand_firm in the fixture plan). */
export const DAY40_SCORECARD = ["U1", "S1"];

function phaseTwoDayData(day: number) {
  const lessons =
    day === 36
      ? [
          {
            ...LESSON,
            id: "call",
            kind: "mock",
            title: "Healthcare call",
            minutes: "20 min",
            cardId: PHASE_TWO_CARD_ID,
            level: 2,
          },
        ]
      : day === 40
        ? [
            {
              ...LESSON,
              id: "friday",
              kind: "scorecard",
              title: "Scorecard",
              minutes: "5 min",
              scorecard: DAY40_SCORECARD,
            },
          ]
        : [{ ...LESSON, id: "read", kind: "read", title: `Read ${day}`, minutes: "5 min" }];
  return { storyDate: "Monday, April 6", minutes: "About 45 min", intro: `Intro for day ${day}.`, lessons };
}

/** Phase 3 fixture: live-call Days 43 and 48 (blocks 9, 10) and the readiness case Days 63–64 (block 13). */
export const PHASE_THREE_DAYS = [43, 48, 63, 64] as const;
export const READINESS_FIELDS = ["understand", "overall"] as const;

function phaseThreeDayData(day: number) {
  const readiness = READINESS_FIELDS.map((id) => field(id, true));
  const lessons =
    day === 43 || day === 48
      ? [
          {
            ...LESSON,
            id: "live",
            kind: "live",
            title: "Live call",
            minutes: "30 min",
            liveRole: day === 43 ? "shadow" : "co_lead",
            substituteCardId: PHASE_TWO_CARD_ID,
            fields: [field("notes", false)],
          },
        ]
      : day === 63
        ? [{ ...LESSON, id: "draft", kind: "write", title: "Draft", minutes: "10 min", fields: readiness }]
        : [
            {
              ...LESSON,
              id: "final",
              kind: "write",
              title: "Finalise",
              minutes: "10 min",
              fields: readiness,
              prefillFrom: { day: 63, lesson: "draft" },
              shareReadiness: true,
            },
          ];
  return { storyDate: "Tuesday, May 5", minutes: "About 45 min", intro: `Intro for day ${day}.`, lessons };
}

interface SavedPhaseTwo {
  block: { number: number; data: unknown; content_hash: string }[];
  days: Record<string, unknown>[];
}

interface Saved {
  plan: { data: unknown; content_hash: string }[];
  blocks: { number: number; data: unknown; content_hash: string }[];
  days: Record<string, unknown>[];
  /** Real Day 1–2 questions this fixture retired. */
  retiredQuestions: string[];
  /** The `learning.unlockAll` setting row (null when missing). */
  unlockAll: unknown;
}

function dayData(day: 1 | 2) {
  return {
    storyDate: day === 1 ? "Monday, March 2" : "Tuesday, March 3",
    minutes: "About 60 min",
    intro: `Intro for day ${day}.`,
    lessons: lessons(day),
  };
}

export class ContentFixtures {
  private readonly owner = new pg.Pool({ connectionString: process.env.DIRECT_URL });
  private saved: Saved | null = null;
  private savedPhaseTwo: SavedPhaseTwo | null = null;
  private savedPhaseThree: SavedPhaseTwo | null = null;

  /**
   * Gate 2 fixture: block 8 and Days 36–40 (a Day-36 mock on card X98, Day 40's scorecard on U1 and S1).
   * The real rows (if imported) are saved and put back by `restore()`.
   */
  async installPhaseTwo(): Promise<void> {
    const block = await this.owner.query<SavedPhaseTwo["block"][number]>(
      "SELECT number, data, content_hash FROM content_blocks WHERE number = 8",
    );
    const days = await this.owner.query<Record<string, unknown>>(
      "SELECT * FROM content_days WHERE day = ANY($1::int[])",
      [[...PHASE_TWO_DAYS]],
    );
    this.savedPhaseTwo = { block: block.rows, days: days.rows };
    await this.owner.query(
      `INSERT INTO content_blocks (number, data, content_hash) VALUES (8, $1, 'fixture')
       ON CONFLICT (number) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash`,
      [JSON.stringify({ number: 8, title: "Test block 8", phase: 2, goal: "Test goal." })],
    );
    await this.owner.query(
      `INSERT INTO content_cards (id, data, content_hash) VALUES ($1, $2, 'fixture')
       ON CONFLICT (id) DO UPDATE SET data = excluded.data`,
      [
        PHASE_TWO_CARD_ID,
        JSON.stringify({
          ...CARD,
          id: PHASE_TWO_CARD_ID,
          title: "Test healthcare card",
          client: "Dana Brooks",
        }),
      ],
    );
    await this.owner.query("DELETE FROM content_days WHERE day = ANY($1::int[])", [[...PHASE_TWO_DAYS]]);
    for (const day of PHASE_TWO_DAYS) {
      await this.owner.query(
        `INSERT INTO content_days (day, block_number, title, type, data, content_hash)
         VALUES ($1, 8, $2, 'normal', $3, 'fixture')`,
        [day, `Test day ${day}`, JSON.stringify(phaseTwoDayData(day))],
      );
    }
  }

  /**
   * Phase 3 fixture (needs `installPhaseTwo` for card X98): blocks 9, 10, 13 and Days 43, 48 (live), 63–64
   * (readiness case). The real rows are saved and put back by `restore()`.
   */
  async installPhaseThree(): Promise<void> {
    const blocks = await this.owner.query<SavedPhaseTwo["block"][number]>(
      "SELECT number, data, content_hash FROM content_blocks WHERE number = ANY($1::int[])",
      [[9, 10, 13]],
    );
    const days = await this.owner.query<Record<string, unknown>>(
      "SELECT * FROM content_days WHERE day = ANY($1::int[])",
      [[...PHASE_THREE_DAYS]],
    );
    this.savedPhaseThree = { block: blocks.rows, days: days.rows };
    for (const number of [9, 10, 13]) {
      await this.owner.query(
        `INSERT INTO content_blocks (number, data, content_hash) VALUES ($1, $2, 'fixture')
         ON CONFLICT (number) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash`,
        [number, JSON.stringify({ number, title: `Test block ${number}`, phase: 3, goal: "Test goal." })],
      );
    }
    await this.owner.query("DELETE FROM content_days WHERE day = ANY($1::int[])", [[...PHASE_THREE_DAYS]]);
    for (const day of PHASE_THREE_DAYS) {
      await this.owner.query(
        `INSERT INTO content_days (day, block_number, title, type, data, content_hash)
         VALUES ($1, $2, $3, $4, $5, 'fixture')`,
        [
          day,
          Math.ceil(day / 5),
          `Test day ${day}`,
          day === 43 || day === 48 ? "live_call" : "normal",
          JSON.stringify(phaseThreeDayData(day)),
        ],
      );
    }
  }

  private async restorePhaseThree(): Promise<void> {
    if (!this.savedPhaseThree) return;
    await this.owner.query("DELETE FROM content_days WHERE day = ANY($1::int[])", [[...PHASE_THREE_DAYS]]);
    for (const row of this.savedPhaseThree.days) {
      await this.owner.query(
        "INSERT INTO content_days SELECT * FROM json_populate_record(NULL::content_days, $1)",
        [JSON.stringify(row)],
      );
    }
    for (const number of [9, 10, 13]) {
      const block = this.savedPhaseThree.block.find((row) => row.number === number);
      if (block) {
        await this.owner.query("UPDATE content_blocks SET data = $1, content_hash = $2 WHERE number = $3", [
          JSON.stringify(block.data),
          block.content_hash,
          number,
        ]);
      } else {
        await this.owner.query(
          "DELETE FROM content_blocks WHERE number = $1 AND NOT EXISTS (SELECT 1 FROM content_days WHERE block_number = $1)",
          [number],
        );
      }
    }
  }

  private async restorePhaseTwo(): Promise<void> {
    if (!this.savedPhaseTwo) return;
    await this.owner.query("DELETE FROM content_days WHERE day = ANY($1::int[])", [[...PHASE_TWO_DAYS]]);
    for (const row of this.savedPhaseTwo.days) {
      await this.owner.query(
        "INSERT INTO content_days SELECT * FROM json_populate_record(NULL::content_days, $1)",
        [JSON.stringify(row)],
      );
    }
    const block = this.savedPhaseTwo.block[0];
    if (block) {
      await this.owner.query("UPDATE content_blocks SET data = $1, content_hash = $2 WHERE number = 8", [
        JSON.stringify(block.data),
        block.content_hash,
      ]);
    } else {
      await this.owner.query(
        "DELETE FROM content_blocks WHERE number = 8 AND NOT EXISTS (SELECT 1 FROM content_days WHERE block_number = 8)",
      );
    }
    await this.owner.query("DELETE FROM content_cards WHERE id = $1", [PHASE_TWO_CARD_ID]);
  }

  /** Replace block 1 and Days 1–2 with the fixture lesson (Day 1 left out until `importDay(1)` if asked). */
  async install(options: { day1Imported: boolean } = { day1Imported: true }): Promise<void> {
    const plan = await this.owner.query<Saved["plan"][number]>(
      "SELECT data, content_hash FROM content_plan WHERE id = 1",
    );
    const blocks = await this.owner.query<Saved["blocks"][number]>(
      "SELECT number, data, content_hash FROM content_blocks WHERE number = 1",
    );
    const days = await this.owner.query<Record<string, unknown>>(
      "SELECT * FROM content_days WHERE day IN (1, 2)",
    );
    // Leftovers from an interrupted run.
    await this.owner.query("DELETE FROM questions WHERE id = ANY($1::text[])", [ALL_FIXTURE_QUESTION_IDS]);
    const retired = await this.owner.query<{ id: string }>(
      "UPDATE questions SET retired = true WHERE pool IN ('day-01', 'day-02', 'assessment-05') AND NOT retired RETURNING id",
    );
    const unlockAll = await this.owner.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key = 'learning.unlockAll'",
    );
    this.saved = {
      plan: plan.rows,
      blocks: blocks.rows,
      days: days.rows,
      retiredQuestions: retired.rows.map((r) => r.id),
      unlockAll: unlockAll.rows[0]?.value ?? null,
    };
    // Tests run with the normal locks; a test can turn content review on with setUnlockAll(true).
    await this.setUnlockAll(false);

    await this.owner.query(
      `INSERT INTO content_plan (id, data, content_hash) VALUES (1, $1, 'fixture')
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash`,
      [JSON.stringify(PLAN)],
    );
    await this.owner.query(
      `INSERT INTO content_blocks (number, data, content_hash) VALUES (1, $1, 'fixture')
       ON CONFLICT (number) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash`,
      [JSON.stringify(BLOCK)],
    );
    await this.owner.query(
      `INSERT INTO content_cards (id, data, content_hash) VALUES ($1, $2, 'fixture')
       ON CONFLICT (id) DO UPDATE SET data = excluded.data`,
      [CARD_ID, JSON.stringify(CARD)],
    );
    await this.owner.query(
      `INSERT INTO content_card_prompts (card_id, prompt) VALUES ($1, $2)
       ON CONFLICT (card_id) DO UPDATE SET prompt = excluded.prompt`,
      [CARD_ID, CARD_PROMPT],
    );
    await this.owner.query("DELETE FROM content_days WHERE day IN (1, 2)");
    if (options.day1Imported) await this.importDay(1);
    await this.importDay(2);
    for (const q of [...QUESTIONS, RETIRED_QUESTION]) {
      await this.owner.query(
        `INSERT INTO questions (id, pool, type, data, content_hash, retired) VALUES ($1, 'day-01', $2, $3, 'fixture', $4)`,
        [q.id, q.type, JSON.stringify(q), q.id === RETIRED_QUESTION_ID],
      );
    }
    for (const q of ASSESSMENT_QUESTIONS) {
      await this.owner.query(
        `INSERT INTO questions (id, pool, type, data, content_hash) VALUES ($1, 'assessment-05', $2, $3, 'fixture')`,
        [q.id, q.type, JSON.stringify(q)],
      );
    }
  }

  /** Write the fixture lessons for `day` (1 or 2), as the import would. */
  async importDay(day: 1 | 2): Promise<void> {
    await this.owner.query(
      `INSERT INTO content_days (day, block_number, title, type, data, write_scoring, content_hash)
       VALUES ($1, 1, $2, 'normal', $3, $4, 'fixture')`,
      [
        day,
        `Test day ${day}`,
        JSON.stringify(dayData(day)),
        day === 2 ? JSON.stringify(WRITE_SCORING) : null,
      ],
    );
  }

  /** The global `learning.unlockAll` setting (restored by `restore()`). */
  async setUnlockAll(value: boolean): Promise<void> {
    await this.owner.query(
      `INSERT INTO settings (key, value) VALUES ('learning.unlockAll', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [JSON.stringify(value)],
    );
  }

  /** Remove fixture rows and put back what was there. Call after the test users are deleted. */
  async restore(): Promise<void> {
    try {
      await this.restoreRows();
    } finally {
      await this.owner.end();
    }
  }

  private async restoreRows(): Promise<void> {
    await this.restorePhaseThree();
    await this.restorePhaseTwo();
    await this.owner.query("DELETE FROM questions WHERE id = ANY($1::text[])", [ALL_FIXTURE_QUESTION_IDS]);
    if (!this.saved) return;
    if (this.saved.unlockAll === null)
      await this.owner.query("DELETE FROM settings WHERE key = 'learning.unlockAll'");
    else
      await this.owner.query("UPDATE settings SET value = $1::jsonb WHERE key = 'learning.unlockAll'", [
        JSON.stringify(this.saved.unlockAll),
      ]);
    await this.owner.query("UPDATE questions SET retired = false WHERE id = ANY($1::text[])", [
      this.saved.retiredQuestions,
    ]);
    await this.owner.query("DELETE FROM content_days WHERE day IN (1, 2)");
    for (const row of this.saved.days) {
      await this.owner.query(
        "INSERT INTO content_days SELECT * FROM json_populate_record(NULL::content_days, $1)",
        [JSON.stringify(row)],
      );
    }
    await this.owner.query("DELETE FROM content_cards WHERE id = $1", [CARD_ID]);
    const plan = this.saved.plan[0];
    if (plan)
      await this.owner.query("UPDATE content_plan SET data = $1, content_hash = $2 WHERE id = 1", [
        JSON.stringify(plan.data),
        plan.content_hash,
      ]);
    else await this.owner.query("DELETE FROM content_plan WHERE id = 1");
    const block = this.saved.blocks[0];
    if (block) {
      await this.owner.query("UPDATE content_blocks SET data = $1, content_hash = $2 WHERE number = 1", [
        JSON.stringify(block.data),
        block.content_hash,
      ]);
    } else {
      await this.owner.query(
        "DELETE FROM content_blocks WHERE number = 1 AND NOT EXISTS (SELECT 1 FROM content_days WHERE block_number = 1)",
      );
    }
  }
}
