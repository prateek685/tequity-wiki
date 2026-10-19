# Client-Ready Engineer Portal: Build Plan

> Status: approved planning document (6 Oct 2026). No application code yet.
> Final design mockup: https://claude.ai/artifact/Bm28QpUG6hvu79XZ34GrKn · first mockup (kept for comparison): https://claude.ai/artifact/DmtMdLP5NN8Mo1uDXmpyon

---

## 0. Context

**Why.** Our engineers work with US healthcare clients, often with no PM between them and the client. The 90-day plan _Client-Ready Engineer_ (198-page PDF, kept outside the repo; text in `docs/pdf-text.txt`) trains client-facing communication. Until now one person has used it with an AI chat assistant. The portal lets **30–100 engineers** follow it lesson by lesson, gives **managers** visibility of progress, and lets **admins** manage content and users.

**What the plan contains** (fully read and audited twice):

- 65 lesson days in 3 phases
- 4 pillars and 14 behaviours
- an 11-criterion call rubric
- 5 personas and 3 difficulty levels
- 49 scenario cards (S01–S49) plus 12 optional extra cards (X01–X12), each with a public brief and a private AI part
- templates A1–A13, AI prompts B1–B8, 54 glossary rows, about 28 resources

**Scope.**

- Internal, single-tenant (one company), and the portal's main language is English.
- No billing, no public sign-up.
- All practice uses the fictional CareBook story. Tasks the PDF writes for the engineer's real project are kept as written.

---

## 1. Decisions (all agreed with the user)

| Area                       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login                      | One "Sign in with Google" page, limited to the company domain                                                                                                                                                                                                                                                                                                                                                            |
| Roles                      | **One role per person.** Each person is an **engineer**, a **manager** or an **admin**. **Several admins are allowed** (the single-admin limit was removed). The last active admin can't be removed or demoted, and admin role changes are audited. Each person sees only their own area. The role switcher exists only in the mockup                                                                                    |
| Stack                      | **Architecture v2 (6 Oct 2026):** React + Vite SPA (UI only) · **NestJS 12 API** + **BullMQ worker** · **Prisma 7 + PostgreSQL 18** · **Redis 8** (job queue) · **Caddy** in front (one origin) · Google sign-in via OIDC with server-side sessions · **Anthropic** via the Vercel AI SDK · Resend email · pnpm + Turborepo monorepo · Node 24. Hosting and the production database are decided later. Full detail in §8 |
| AI provider                | **Anthropic** (Claude Haiku 5.5, `LLM_SCORING_MODEL`), through the Vercel AI SDK. Real-project answers aren't AI-scored until the user approves. See §7.1                                                                                                                                                                                                                                                                |
| Reminders                  | Email to managers only: check-ins due and new red flags (11 Oct 2026)                                                                                                                                                                                                                                                                                                                                                    |
| UI style                   | Calm enterprise: neutral greys, **orange accent**, muted green only for Done/Passed, thin borders, compact tables. **Dashboard-style Home** (bento cards, as in the first mockup but restyled). **Progress only**, no streaks or badges. Fully responsive. Full spec in §8b                                                                                                                                              |
| Day numbering              | **Day 1 … Day 65 only.** No weeks or weekday names in the UI. Phase 1 = Days 1–20, Phase 2 = Days 21–40, Phase 3 = Days 41–65. Final review = Day 65                                                                                                                                                                                                                                                                     |
| Pacing                     | Lessons can be done **any day, weekends included**. Target: Day 65 within **90 calendar days** of the start date. Faster pace builds a buffer. Engineers add their own pause days, which move the target date                                                                                                                                                                                                            |
| Day step order             | **Prep, Learn, Mock and Write in any order** (all required, if the day has them). Then the **Daily quiz last**, which completes the day                                                                                                                                                                                                                                                                                  |
| Daily quiz                 | 5 questions on the **whole day**: 3 multiple choice, 1 client scenario, 1 short written answer. Must be done; **no pass mark**                                                                                                                                                                                                                                                                                           |
| Assessment                 | After every 5th day (Days 5, 10 … 60): about 10 questions. **60% on multiple choice only** to continue (admin setting). Retake after 1 day with new questions                                                                                                                                                                                                                                                            |
| Scoring of answers         | Written quiz answers, assessment answers and Write tasks are AI-scored 1–5 against **their own model answer and 2–3 scoring points**, not the call rubric                                                                                                                                                                                                                                                                |
| Call rubric                | Mock logs: the engineer self-scores **criteria 1–10**. Gates: the manager scores **criteria 1–11**. In both, criteria that didn't come up are skipped and the average uses scored criteria only                                                                                                                                                                                                                          |
| Mock prompt                | A "Copy AI prompt" button copies the card's full prompt without showing it. Only admins can _view_ the private part. Every copy is logged                                                                                                                                                                                                                                                                                |
| Real-project tasks         | Kept **exactly as in the PDF**. If the PDF gives a CareBook fallback, both options are shown. Real answers are AI-scored with a stronger safety reminder. They are private                                                                                                                                                                                                                                               |
| Live-call days             | Per day the engineer picks: **had the live call** / **shadowed another team** / **schedule for later** (next day still unlocks; must be done before the next gate or the final review) / **PDF fallback or CareBook substitute mock**. Write tasks stay as in the PDF                                                                                                                                                    |
| Privacy                    | Managers see completion, scores and scorecards for everything. They can read **only** assessment written answers and the submitted **readiness case**. Prep, journal, daily quiz answers, Write submissions and mock notes are private to the engineer                                                                                                                                                                   |
| Day 1 vs Day 90            | Day 1: 14 behaviours scored 1–5, averaged per pillar. Day 90: final scorecard. Compared **per pillar**, as in the PDF                                                                                                                                                                                                                                                                                                    |
| Repeat after a failed gate | The portal suggests the 2 weakest 5-day blocks and the manager confirms. They reopen as attempt 2, attempt 1 is kept, and the gate is re-run                                                                                                                                                                                                                                                                             |
| Day-90 "Another cycle"     | Recorded only in v1                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 2. The 65-day schedule

**Every lesson day:** Prep · Learn · Mock · Write (any order) → Daily quiz.

The PDF's 5-minute "Log" becomes three fields in the mock log, saved to the private journal: _went well_, _one thing to fix next time_, and an optional reflection box showing that block's log question.

| Checkpoint                           | When                                                                                                                                 | Blocks progress?                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Assessment + scorecard**           | After Days 5, 10, 15 … 60 (12 times)                                                                                                 | **Yes.** ≥ 60% on multiple choice + scorecard submitted, before the next day opens |
| **Self-check and journal checklist** | With each scorecard (the PDF's "Self-check before the weekend" and "Keep in your journal")                                           | No                                                                                 |
| **Optional extra practice**          | After every 5th day: that block's hardest card, one level harder (the PDF's weekend practice)                                        | No                                                                                 |
| **Manager check-in**                 | After Days 10, 30, 50, 60. The engineer books it; the manager gets an email when it's due and records Green / Amber / Red and a note | No                                                                                 |
| **Gate 1**                           | After Day 20                                                                                                                         | **Yes.** Day 21 opens after a pass                                                 |
| **Gate 2**                           | After Day 40. Also records the Phase 3 live-call plan                                                                                | **Yes.** Day 41 opens after a pass                                                 |
| **Final review**                     | Day 65                                                                                                                               | Final outcome                                                                      |

**Special days (checked against the PDF):**

- **Day 1:**
  - Prep is the setup (install an AI voice app; the journal is built in; check-in and gate dates are shown).
  - Write is the **14-behaviour baseline** plus **three goals for the 90 days**.
  - The PDF says this day takes about 60 minutes.
- **Live-call days (9):** Days 43, 45, 48, 50, 53, 55, 58, 60 and 62.
  - Shadow: Days 43, 45. Co-lead: Days 48 and 53, 55. Live demo segment: Day 50. Lead: Days 58, 60. Solo: Day 62.
  - The PDF's own fallbacks are offered per day:
    - Days 43 and 45: shadow later
    - Day 50: record the demo privately and share a written summary
    - Day 55: a 20-minute Level 3 mock (S46 or X12)
    - Day 60: lead all async client updates
- **Real client actions (not calls):** Day 56 (AI prep + agenda email sent 24 hours ahead) and Day 64 (weekly status report sent to the client). The Day 56 "mock" is a prep checklist with no rubric log.
- **Days with no Prep or Learn in the PDF:** Learn is missing on Days 50, 55, 60 and 64; Prep and Learn are missing on Day 65. Live days say "the live call is today's learning". **Only the steps a day has are required.**
- **Day 61:** repeat the Day-1 call (S01) with no prep. Write: a private "3 differences" comparison.
- **Days 63–64:** draft and finalise **"My readiness case" (A11)**, which is shared with the manager on submit.
- **Day 65 (final review):** final scorecard plus "my plan for the next 90 days". **No daily quiz.**
- **Reused cards** keep their own level and date per use: S01 (Day 4, 3 rounds of "rate only your first 60 seconds"; Day 61, no prep), S04 (Day 10, Level 2), S06 (Day 9, Level 2), S12 (Day 18, Level 2).

---

## 3. Scoring (approved)

There is **no single overall grade**. There are 7 kinds of score; **only the assessment (60%) and the gates can block**.

| #   | Score          | Scale and how                                                                                                                           | Who                 | Effect                                               |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| 1   | Daily quiz     | Multiple choice and scenario: right or wrong, with an explanation for every option. Written answer: AI 1–5                              | Auto + AI           | Completion required, no pass mark                    |
| 2   | Write task     | AI 1–5 on the task's scoring points. Non-text tasks are just "submitted"                                                                | AI                  | Writing chart                                        |
| 3   | Mock log       | Criteria 1–10, 1–5 each, skip what didn't come up, average the rest                                                                     | Engineer            | Call rubric chart                                    |
| 4   | Assessment     | Multiple-choice correct ÷ total ≥ 60%. Written answers AI 1–5, shown only, and the manager can override                                 | Auto + AI + manager | **Blocks** the next day                              |
| 5   | Scorecard      | 1–5 per pillar using the PDF's meanings (1 "avoid or freeze" … 5 "well under pressure"), 1–2 lines of proof, days and mocks auto-filled | Engineer            | **Required** to continue. Pillar chart and red flags |
| 6   | Day-1 baseline | 14 behaviours 1–5, averaged per pillar (Understand 4, Communicate 4, Own 4, Stand firm 2)                                               | Engineer            | Day 1 → Day 90                                       |
| 7   | Gates          | Criteria 1–11, 1–5 each, skip what didn't come up. #11 comes from the written follow-up                                                 | Manager             | **Blocks** the next phase                            |

**Gate pass bars (from the PDF, word for word):**

| Gate                  | Pass                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate 1 (after Day 20) | Average ≥ 2.5 **and** no criterion at 1 **and** recap within 2 hours                                                                                                                   |
| Gate 2 (after Day 40) | Average ≥ 3.0 **and** no criterion below 2 **and** basic healthcare terms used correctly. Written follow-up = recap + one of: bad-news email, escalation message, weekly status report |
| Final review (Day 65) | Checked in this order: **Client-ready** (average ≥ 3.5 and nothing below 3) → **Ready with light support** (average ≥ 3.0) → **Another cycle** (below 3.0)                             |

- Below the bar, the portal suggests **Repeat 2 focus blocks**.
- At or above the bar, the manager picks **Pass** or **Pass with focus areas** (1–2 focus items).
- The manager can override the suggestion with a note.

**Rubric → pillar mapping** (approved; used for red flag 3):

| Pillar      | Criteria                                                 |
| ----------- | -------------------------------------------------------- |
| Understand  | 3 Questions · 4 Playback · 5 Business link               |
| Communicate | 1 Opening · 2 Answer-first · 6 Trade-offs                |
| Own         | 8 Risks and bad news · 10 Closing · 11 Written follow-up |
| Stand firm  | 7 Unknowns · 9 Disagreement                              |

**Red flags** (nightly job; pause days excluded). **Follow PDF §5.4 exactly** (user, 11 Oct 2026), each shown with
the PDF's management action word for word:

1. Scorecard missing 2 weeks in a row
2. The same pillar at 2 or below for 3 weeks (3 scorecards in a row)
3. Self-score and gate score differ by 2 or more (a scorecard pillar score vs the gate's average for that pillar)
4. Fewer than 3 practice days a week, for 2 weeks (days with any lesson, quiz or assessment done; 2 consecutive 7-day periods)
5. Avoiding shadowing or co-lead opportunities in Phase 3 (measured as ≥ 2 live-call deferrals or substitutes; from M7)
6. A gate not passed

(The earlier portal-only "90-day target date passed" flag was dropped.)

**Emails** (user, 11 Oct 2026): **managers only**, for two things: a bi-weekly check-in coming due and a new red
flag. Engineers get no email.

---

## 4. Content model

Content lives in Postgres and is edited by the admin. Ids follow the plan (`S07`, `A3`, `P2`). Weeks stay in the content model for editing and grouping only; the engineer sees day numbers.

| Entity                              | Key fields                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase                               | number, name, day range, gate                                                                                                                                                                    |
| Block (the PDF's week)              | number 1–13, theme, goal, pillars, domain focus, log question, self-check list, journal list, check-in?                                                                                          |
| Day                                 | plan_day 1–65, block, title, type (`normal` / `live_call` / `real_action` / `final_review`)                                                                                                      |
| Step                                | day, kind (prep / learn / mock / write / quiz), PDF text, source (CareBook / real project / both + fallback text), response type (text / template / form), scoring points + model answer (Write) |
| Framework, Resource                 | name, how it works, example; resource links (pulled from the PDF)                                                                                                                                |
| Persona, Mock card (public)         | P1–P5…; card title, persona, level, duration, skill, story, fact sheet, goal, client may throw, example script, what good looks like                                                             |
| Mock card private (admin only)      | who you are, scenario, hidden facts, curveballs, rules, feedback instructions, prompt template with `{level}` and `{date}`                                                                       |
| Card use                            | which card a day uses, with that day's level, story date and round notes                                                                                                                         |
| Live-call config                    | role (shadow / co-lead / lead / solo), PDF fallback text, substitute card                                                                                                                        |
| Pillar, Behaviour, Rubric criterion | 4 / 14 / 11 rows; anchors; criterion → pillar mapping                                                                                                                                            |
| Template, AI prompt, Glossary       | A1–A13 (field lists drive forms, e.g. A1 pre-call card, A9 shadow sheet, A11 readiness case); B1–B8; 54 terms                                                                                    |
| Question + options                  | type, stem, client line, 4 options with explanations, model answer, scoring points, **source excerpt from the PDF**, version (no review status: everything imported is live, 7 Oct 2026)         |
| Question pool                       | per day (10 questions, show 5) and per assessment (about 20, show 10)                                                                                                                            |

**Volume:**

- Daily pools: 64 days × 10 = 640 questions (Day 65 has no quiz).
- Assessment pools: 12 × 20 = 240 questions.
- In total **≈ 880 questions** in the pools, **≈ 440 shown** to each engineer.

---

## 5. Database

**PostgreSQL 18** with **Prisma 7** (schema and migrations in git, `apps/api/prisma`). About 40 tables in 5 groups. 🔒 = private to the engineer.

**Database setup rules:**

- **Where:** plain PostgreSQL 18. Locally and in CI it's a Docker container (`postgres:18.6`, port 4132 on 127.0.0.1). The production database is decided with hosting: our own container (with offsite backups from day one), the host's managed Postgres, or Supabase. It must run Postgres 18; the code is plain Postgres and runs on all three.
- **Connections:** only the API and the worker connect, as `app_user` through `DATABASE_URL` with Prisma 7's `pg` driver adapter. Migrations and setup scripts use the owner role through `DIRECT_URL`. On Supabase, migrations go through the session pooler (IPv4) and the app user becomes `app_user.<project-ref>`.
- **App database role:** `app_user` (member of `app_rw`), **without BYPASSRLS**, never `postgres`. It is created and checked by `apps/api/scripts/db-setup-app-role.ts`. `FORCE ROW LEVEL SECURITY` is on for all tables. The app role cannot create temporary tables, and every SECURITY DEFINER function pins `search_path = pg_catalog, public, pg_temp`.
- **Row-level security policies** are hand-written SQL inside Prisma migrations (Prisma has no RLS support). Every new table gets RLS, policies, grants and privacy tests in the same change.
- **Per-request identity:** each request runs `set_config('app.user_id', …, true)` and its queries inside one Prisma transaction (`PrismaService.withUser` in `apps/api/src/prisma/prisma.service.ts`). The role is **never** passed in; the database reads it from `users`.
- **Sessions** live in `app.sessions` (token hashes only), reachable only through SECURITY DEFINER functions. Disabling a user deletes their sessions at once.
- **No browser access to the database**, ever. If Supabase is chosen, its Data API stays off (the migrations also block Supabase's `anon` and `authenticated` roles).
- **Backups:** a nightly backup is required before any production data exists. Where it runs (GitHub Actions or the worker) is an open decision (§11).

**A. People and access**

- `users`: email, name, google_sub, role (`engineer` / `manager` / `admin`; several admins allowed, at least one must stay active), status
- `teams`, `team_members` (one team per engineer), `team_managers`
- `enrollments`: user, start_date, target_date, status, cycle
- `pauses`: from, to, reason

**B. Content:** the tables from §4, including `mock_card_private` (admin only), `questions`, `question_options`, `question_pools`, `errata`. Content is written only by `pnpm content:import`; the app reads it (every active user) and never changes it. There are no review columns: **everything imported is live** (decided 7 Oct 2026). A question removed from the files that engineers were already asked stays as `retired` (never picked for a new quiz).

**C. Engineer activity**

- `day_progress`: day, attempt, status (locked / open / done / live scheduled), unlocked how
- `prep_entries` 🔒, `journal_entries` 🔒, `write_submissions` 🔒
- `quiz_attempts`: daily or assessment, attempt, multiple-choice %, passed, retake opens at
- `attempt_items`: each answer. 🔒 for daily; the manager can read assessment answers
- `ai_scores`: 1–5, points met, reason, better sentence, possible-PHI flag, model and prompt version, retry status
- `mock_logs`: path (card / live / other team / scheduled / fallback); live date and role; notes 🔒
- `rubric_scores`: **one table for all rubric scores** (mock self-logs, gates, future AI mock calls)
- `behaviour_baselines`: Day-1 14 scores
- `scorecards` + `scorecard_pillars`
- `readiness_cases` 🔒 until submitted, then visible to the manager

**D. Manager actions**

- `score_overrides`: append-only history
- `manual_unlocks`: reason required
- `checkins`
- `gate_results`: criteria via rubric_scores, average, lowest, recap on time, healthcare terms OK, follow-up type, suggested and final outcome, focus items, repeat blocks, Phase 3 live-call plan
- `red_flags`

**E. System:** `settings` (pass mark, retake wait, behind tolerance, gate bars), `audit_log` (prompt copies, overrides, unlocks, edits), `email_log`.

**Privacy is enforced in the database, not just hidden in the UI:**

1. **Row-level security.** Every request sets the user and role. Private tables have **no manager or admin read rule**. Managers can read assessment answers and submitted readiness cases only for engineers on their teams. `mock_card_private` is readable only by admins.
2. **Server-only data layer.** Role-specific functions return typed results with no private fields. The browser never queries the database.
3. **Route guards.** `/app/*` (engineer), `/manager/*`, `/admin/*`. A wrong role gets 403.
4. **Automated privacy tests.** They log in as a manager and the admin, call every endpoint and run direct SQL, and expect zero private rows.

---

## 6. Content: written once from the PDF (decided 7 Oct 2026)

The curriculum is fixed, so there is no content pipeline. Claude writes every lesson and question once.

1. **Content files in the repo** (`content/`, YAML): `plan.yaml` (phases, blocks, pillars, behaviours, rubric), `days/day-NN.yaml` (title, type and the Prep / Learn / Mock / Write steps, word for word from the PDF with its page number; errata from §11 fixed), `cards/`, `templates/`, `prompts/`, `glossary.yaml`, `resources.yaml`, and `questions/day-NN.yaml` / `questions/assessment-NN.yaml`.
   - **Day numbers, not weeks:** where the PDF refers to the plan's own schedule ("By Friday", "your Monday notes", "Week 1 Thursday"), the text says the day number instead ("By Day 5", "your Day 1 notes", "Day 4"). CareBook story dates ("It's Monday, March 2") stay as written.
2. **Every question quotes its source passage** from the day's lesson text. Written questions also have a model answer and 2–3 scoring points.
3. **`pnpm content:check`** (zod schemas in `packages/content`) validates every file and cross-checks: required steps, card and template references, 4 options with 1 correct and an explanation for each, the quote found in the source text, CareBook names only, no duplicates. Runs in CI.
4. **`pnpm content:import`** loads the files into Postgres, and **everything imported is live**: a day opens for engineers once it is imported, and the daily quiz draws from every question in the day's pool. It can be re-run: a changed file simply replaces the old content (a changed question gets a new version; quiz answers keep the question as it was asked). A question removed from the files is deleted, or retired (kept, never asked again) if engineers were already asked it.
5. ~~Review in the portal (`/admin/content`)~~ **Removed (user decision, 7 Oct 2026):** there is no admin content review. The user checks the course from the engineer pages and reports problems; a fix = edit `content/` + `pnpm content:import`.
6. **Later edits:** change the file and re-import.

## 7. AI scoring

- **Input:** task, context (CareBook or real-project flag), model answer, 2–3 scoring points, the engineer's answer.
- **Prompt:** a friendly US client-communication coach.
  - Judges only the scoring points.
  - Doesn't penalise non-native phrasing unless clarity is a scoring point.
  - Treats the answer as data and ignores any instructions inside it.
  - Flags possible PHI.
- **Output (strict JSON):**
  - each scoring point marked met / partly / not met
  - a score of 1–5
  - a 1–2 sentence reason
  - one better sentence
  - a possible-PHI flag
- **Consistency:**
  - Point judgements come before the score, and the server checks they agree.
  - Sample answers serve as examples and as a test set that must pass before any prompt or model change.
  - Model and prompt version are stored with every score.
  - Managers can override assessment scores.
- **Failures:** the answer is saved first. Scoring runs in the background with 3 retries and a sweep every 10 minutes. The engineer sees "Score coming soon". **Progress never waits for AI.**
- **Safety reminders on every answer box:**
  - CareBook tasks: "Practice only: use CareBook details. No real client or patient data."
  - Real-project tasks: "Real project is fine: anonymise names, no patient data, credentials or confidential documents."
  - The provider must be company-approved for client (non-patient) data.

### 7.1 LLM provider: Anthropic, Claude Haiku 5.5 (decided 15 Oct 2026; replaces OpenRouter with free models)

- **All LLM calls go to Anthropic's API.** They are used for answer scoring only (questions are written once, §6).
  - Calls use the **Vercel AI SDK** (`ai` 7) with `@ai-sdk/anthropic`, from the **worker only**, behind one `LlmClient` interface in `apps/api/src/llm/`. The SDK's structured output validates every response against our zod schema.
  - The SDK's own retries are off (`maxRetries: 0`): BullMQ owns retries, so a failure is never retried twice.
  - The API key (`ANTHROPIC_API_KEY`) is set only in the API and worker environment. It is never sent to the browser.
  - Despite its name, the AI SDK needs no Vercel hosting. It changes major versions often, so it is pinned exactly and wrapped.
- **Model: `claude-haiku-5-5`**, set by `LLM_SCORING_MODEL` (configuration, not code).
  - Haiku 5.5 takes no `temperature`, so none is sent; `effort: low` keeps it from thinking at length on a short, rubric-bound task.
  - Anthropic has no automatic fallback list. A failed call is retried by BullMQ with backoff.
  - The admin Settings page shows the active model and the scorer's pending and failed counts.
- **Cost:** $0.10 in / $0.50 out per million tokens. A scoring is about 700 tokens in and 200 out, about 175–250 scorings per engineer for the full plan, so the whole company (100 engineers) costs about $4–5. The BullMQ limiter allows at most 15 scoring jobs a minute, and a 429 response is retried with backoff. The engineer's progress never waits.
- **Scoring design:**
  - Structured JSON output, always validated with zod, then the server's consistency check. An invalid result is a failed attempt and is retried.
  - **Calibration test set** (sample answers with expected scores ±1) is run whenever the model or the prompt changes.
  - Model id + prompt version are stored on every score (already in `ai_scores`).
- **Data safety:**
  - Anthropic's API does not train on API data by default.
  - **Real-project answers are saved as "submitted" without AI scoring** until the user approves. The engineer sees "AI feedback isn't available for real-project answers yet."
  - This is a setting (`ai.scoreRealProjectAnswers = false`) that can be switched on once the user approves.

_(Reference, if a paid model is chosen later: about 175 scorings per engineer for the full plan, roughly $0.8–3.2 per engineer depending on the model;)_

---

## 8. Architecture

**Architecture v2, approved 6 Oct 2026.** It replaces the first M0 build (Next.js on Vercel, Supabase, Auth.js), because of Vercel Hobby's limits (cron at most once a day, non-commercial use only), best-effort background work, no long-lived connections for future voice mocks, and Auth.js v5 never leaving beta.

```
Browser ──HTTPS──► Caddy (portal domain) ── /       → React app (built files)
                                         └─ /api/*  → API (NestJS) ─► PostgreSQL 18 (app_user, RLS)
                                                          │ enqueue
                                                          ▼
                                                       Redis ◄── worker (NestJS: BullMQ jobs + schedules)
                                                                           ─► Anthropic, Resend, Postgres
```

- **Monorepo** (pnpm workspaces + Turborepo): `apps/web` (React + Vite), `apps/api` (NestJS API and worker, Prisma), `packages/contracts` (zod schemas for every request and response, shared by both), `packages/config` (TypeScript, ESLint, Stylelint).
- **Web app:** React 19 + Vite 8 single-page app; TanStack Router (role guards in `beforeLoad`, for navigation only) and TanStack Query; react-hook-form with the shared zod schemas; Tailwind 4 with our tokens; shadcn/ui on Radix; Inter; lucide icons; charts with Recharts (from M2). No secrets and no database access.
- **One origin:** Caddy serves the app and forwards `/api/*` to NestJS, so the session cookie is first-party and there is no CORS. The Vite dev server proxies `/api` the same way.
- **Login: "Continue with Google"**, no passwords.
  - Google OIDC in NestJS (`openid-client`): authorization code flow with PKCE, state and nonce; `hd` pre-selects the company account.
  - The OAuth client is of type **Internal** in the company Workspace, and the API also checks the verified email's domain.
  - **Server-side sessions:** an httpOnly, SameSite=Lax cookie holds a random token; Postgres stores only its hash (7 days, 12 hours idle). Role and status are read from the database on every request, so a role change applies on the next request and disabling a user signs them out at once.
  - The first admins come from `INITIAL_ADMIN_EMAILS` (loaded at setup). Admins can promote other users to admin.
  - **New company sign-ins start as active engineers** (changed 7 Oct 2026; previously they waited as "pending"), enrolled from the day of their first sign-in. Admins change role, team and start date afterwards. Emails in `INITIAL_ADMIN_EMAILS` start as admins.
  - A local test login (`/dev-login`, test accounts `@test.local` only, never real company accounts) exists only outside production (the route isn't registered in production; CI checks it returns 404).
- **Authorization lives in the API:** a global guard (session, role, status), `@Roles()` per route, a CSRF check on every state-changing request (custom header + Origin), rate limits, and row-level security in the database underneath.
- **Database:** PostgreSQL 18 + Prisma 7; see §5.
- **Background jobs: BullMQ + Redis** in a separate worker process (same NestJS codebase, `worker.ts`).
  - Postgres is the source of truth: an answer is saved as _pending_ first, then enqueued with a deterministic job id. Retries are BullMQ's own (3 attempts with backoff).
  - Schedules are BullMQ job schedulers, registered once however many workers run: **red flags every hour**, reminder emails daily, a score safety net hourly (re-queues answers saved while Redis was down). Retake availability, pace and target date are computed when read.
  - Redis must use `maxmemory-policy noeviction`. Pay-per-request Redis is avoided (BullMQ sends commands constantly).
- **Email:** Resend.
- **Environments:**
  - **Local:** `docker compose up -d` (Postgres + Redis only) + `pnpm dev`. Ports use the project's 41xx block.
  - **Production and staging:** planned as three containers (`web` = Caddy with the built app, `api`, `worker`) plus Redis and Postgres, release order migrations → api and worker → web. **Built once the host is decided** (draft Dockerfiles and Caddyfile are in `infra/`, not used yet).
- **Future AI mock calls in the portal:**
  - New tables: `mock_sessions` (transcript 🔒) and `mock_session_feedback`.
  - The card's private part is used **only on the server** as the AI client's instructions.
  - The AI's rubric scores go into `rubric_scores` (source = AI mock), so they appear on the same charts.
  - The Mock step already has a slot for a "Start call" button. Voice comes later via a realtime voice API; the long-lived NestJS server can hold those connections.

---

## 8a. Coding standards and performance (required for all code)

**Code quality**

- **TypeScript `strict`** with `noUncheckedIndexedAccess`. No `any` (lint error), no `@ts-ignore` without a reason.
- **ESLint 10** (typescript-eslint recommended type-checked, @eslint-react, jsx-a11y-x recommended) and **Prettier**. Errors only for real bugs (`any`, floating/misused promises, `==`) and the design-system bans; style rules (import order, type imports, console) are auto-fixed warnings that never block. The pre-commit hook runs lint-staged only; typecheck runs in CI.
- **Versions are pinned exactly** for the framework and toolchain; the lockfile is committed; a wrong Node version stops the install (`engine-strict`). See `CLAUDE.md` for the version traps (Prisma and TypeScript `latest` tags).
- **Folder structure by feature:**
  - `apps/api/src/<module>` (controller + service per feature; services are the only code that touches Prisma)
  - `apps/api/src/rules` and `packages/contracts` (pure rules: unlock, scoring, red flags, access)
  - `apps/web/src/routes` (pages), `apps/web/src/features/<area>` (queries, forms), `apps/web/src/components/ui` (shared components)
  - `packages/contracts` (the API contract: one zod schema per request and response)
- **Pure business rules.** Unlocking, gate maths, pace and red flags are pure, side-effect-free functions with full unit tests.
- **Validate at every boundary.** A zod schema checks every API input (our `ZodValidationPipe`), every API response in the web app, every AI response and every imported content file.
- **Errors:** typed error results for expected failures (validation, locked day). Unexpected errors are logged with a request id and shown to the user as a plain message, never a stack trace.
- **Logging:** structured JSON logs (pino) with no answer text, no PHI and no secrets.
- **Naming and style:**
  - descriptive names; small single-purpose functions
  - comments only where the "why" isn't obvious
  - no dead code; constants instead of magic numbers (thresholds come from `settings`)
- **Git:** short-lived branches, Conventional Commits, pull-request review required, and CI green before merge.

**Performance**

- **Small browser bundle:** every page is code-split by the router; the initial JavaScript stays under **200 KB gzipped** (about 140 KB at M0). Heavy libraries (charts) load only on the pages that use them.
- **Database:**
  - Prisma `select` only the fields a screen needs.
  - No N+1 queries: batch with `include` / `in` queries.
  - Indexes on every foreign key and on hot filters (`enrollment_id + day`, `status`, `team`).
  - Pagination on all lists.
  - Prisma client reused as a singleton.
- **Caching:** TanStack Query caches API data briefly in the browser; course content can be cached longer and invalidated when an admin publishes. Hashed build files are cached for a year by Caddy; `index.html` is always revalidated.
- **Background work:** AI scoring and emails run in the worker (BullMQ), never in the request path.
- **Front end:** self-hosted Inter, lazy-loaded charts, no heavy UI libraries, optimised images. Targets: **Lighthouse ≥ 90** on mobile; **largest-content paint < 2.5 s** and **interaction latency < 200 ms** on a mid-range phone.
- **Checks in CI:** a bundle-size budget and Lighthouse CI on key pages (Home, Day page, Team). _Added in M2, once the real Home and Day pages exist (M0 pages are placeholders)._

**Security and accessibility**

- Secrets live only in environment variables (local `.env` files are git-ignored; production uses the host's env vars).
- The API checks session, role and CSRF on every call; row-level security checks again in the database.
- Strict security headers from Caddy (and helmet on API responses): CSP with `script-src 'self'` (no inline scripts), HSTS, `X-Frame-Options: DENY`. Styles allow `'unsafe-inline'` because Radix injects small style elements and positioning styles; CSS cannot run code.
- Simple rate limits on AI scoring and prompt copies.
- Accessibility to **WCAG 2.1 AA**: keyboard support, labels, contrast in both themes, axe checks in tests.

## 8b. UI design system (one source of truth for every screen)

**Typography: Inter** (one variable font file, self-hosted via `@fontsource-variable/inter`). It replaced IBM Plex on 6 Oct 2026: one standard font that looks identical on every platform.

- **Why this font:** Inter was designed for screens. It stays compact and readable at 13–16 px, which suits dense manager tables, and it reads well in long lesson text.
- **No mono font:** day numbers, scores, percentages, dates and ids use `tabular-nums` so columns line up.
- **Type scale** (rem tokens; nothing outside it):

  | Token  | Size / line height            |
  | ------ | ----------------------------- |
  | `xs`   | 12 / 16                       |
  | `sm`   | 13 / 20                       |
  | `base` | 14 / 22 (UI)                  |
  | `md`   | 16 / 26 (lesson reading text) |
  | `lg`   | 18 / 26                       |
  | `xl`   | 22 / 30 (page titles)         |
  | `2xl`  | 28 / 36 (dashboard greeting)  |

- **Weights:** 400 for text, 500 for labels and buttons, 600 for headings.
- **Lesson text width:** at most about 68 characters.
- **Section labels:** 12 px uppercase with 0.05em letter-spacing.

**Colour tokens** (CSS variables, light and dark themes):

| Role                      | Use                                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutrals                  | Slate scale: page background, surface, subtle, line, text, muted text                                                                                                                                                                  |
| **Accent: orange**        | Primary buttons, active menu item, focus ring, progress bars, links, selected states. Shades: `orange-50` (tint backgrounds), `100`, `500` (main), `600` (hover), `700` (text on light). Dark theme uses a lighter orange for contrast |
| **Success: muted green**  | Only for _Done / Passed_ pills and checkmarks                                                                                                                                                                                          |
| Warning: deep amber-brown | Behind pace, gate due. Kept distinct from the orange                                                                                                                                                                                   |
| Danger: red               | Failed, red flags, blocked                                                                                                                                                                                                             |
| Info: slate-blue          | Checkpoints                                                                                                                                                                                                                            |
| Pillar colours            | Used only in charts, as muted tints                                                                                                                                                                                                    |

**Light theme is the default** for everyone (7 Oct 2026); dark is opt-in through the toggle in the top bar and remembered per browser. All text pairs meet WCAG AA contrast in both themes. The `faint` grey is for decoration only (dividers, disabled icons), never for text.

**Spacing, radius, elevation:**

- spacing scale 4 / 8 / 12 / 16 / 20 / 24 / 32 for layout spacing (padding, margins and gaps between blocks). Compact controls may use the 2 px half-steps Tailwind provides (e.g. 6 px or 10 px inner padding), never arbitrary values.
- radius 6 px (controls) and 10 px (cards)
- one subtle shadow for cards; 1 px borders everywhere

**Consistent CSS, no one-off styling:**

- Tokens are defined once (Tailwind theme mapped to CSS variables). Components use **only** these tokens: no hex values, no arbitrary Tailwind values (`w-[13px]`) and no `style={{…}}` in components.
- **Lint rules enforce this:** ESLint bans inline `style` and arbitrary values; Stylelint and Prettier keep the order. Radix and link states use named variants defined once in `globals.css` (`state-open`, `highlighted`, `current`, …) instead of arbitrary variants.
- **Shared UI components** live in `apps/web/src/components/ui` (shadcn/ui on Radix, re-themed with our tokens; Radix appears only inside these files): Button, Card, Badge/Pill, Table, ResponsiveTable, Tabs, ScoreScale (1–5 + n/a), ProgressBar, Ring, Stat, StepList, EmptyState, Toast. Screens are composed from these, never re-styled per page.
- **One `cn()` helper** with variants (class-variance-authority) for component states. No ad-hoc class strings for the same thing in different places.
- **Variant states are designed once:** loading skeletons, empty states, errors, disabled.

**Engineer Home dashboard** (bento layout from the first mockup, restyled in this system):

1. **Header:** a "Good morning, Aarav" greeting, "Day 2 of 65 · Phase 1", the lesson title and a primary "Continue Day 2" button. No gradient banner.
2. **Today's steps** (wide card): Prep, Learn, Mock and Write with status (to do / done / up next), and the Daily quiz locked until the four are done.
3. **Your 90 days** (ring card): days done out of 65, the finish-by date (start date + 90 days + pause days), and on pace / N days behind. Gates passed 0 / 3.
4. **This block** (Days 1–5 strip): done / today / upcoming per day, with the checkpoint after Day 5 (assessment + scorecard) and any check-in or gate.
5. **Day-1 baseline per pillar:** 4 bars with muted pillar tints ("you'll compare against this on Day 65").
6. **Latest feedback:** last mock log average, last AI score with its "fix next time" line.
7. **Coming up:** the next 3 days as cards (locked, with a preview), then the next checkpoint.

The manager and admin dashboards follow the same card system (summary stats → main table → side panel for this week's gates and check-ins).

## 9. Screens (each role sees only its own)

**Engineer** (bottom tab bar on phones)

- **Home:** today's day, its steps, Day N of 65, target date and pace, the next checkpoint, latest feedback.
- **Day page:** Prep, Learn, Mock and Write in any order, then the quiz. The Mock step has the brief, the copy-prompt button and the log. Live days have the path chooser.
- **Daily quiz:** one question at a time, with an explanation after each answer.
- **Assessment:** about 10 questions, the result, and the retake time. Followed by the scorecard, self-check and journal checklist.
- **My plan:** Days 1–65 by phase, with checkpoints in between.
- **Progress:** call rubric, writing, pillars, assessments, Day 1 → Day 90.
- **Journal (private).**
- **Library:** frameworks, templates, AI prompts, glossary, resources, extra cards.
- **Readiness case (Days 63–64).**
- **My pauses.**

**Manager**

- **Team:** each engineer's day, pace, pillar scores, status and red flags.
- **Engineer detail:** charts, scores and scorecards. No private content.
- **Assessment answer review:** with score override and history. (Removed 12 Oct 2026 at the user's request: managers no longer review written answers; the AI score stands.)
- **Check-in form.**
- **Gate form:** criteria with "didn't come up", the average, lowest score and suggested outcome, healthcare terms, follow-up type, focus items or repeat blocks, and the Phase 3 live-call plan.
- **Final review:** with the readiness case.
- **Red flags.**
- **Unlock with reason.**

**Admin**

- Content editor (phases → blocks → days → steps)
- Mock cards (public and private)
- ~~Content review (lessons and questions, approve / reject)~~ removed 7 Oct 2026: everything imported is live (§6)
- Library editors
- Errata
- Users, roles, teams, start dates
- Settings
- Scoring test runs
- Audit log

---

## 10. Milestones (each one can be clicked through)

1. **M0:** project setup, Google login, roles and teams, the database with privacy rules and privacy tests. **Rebuilt on architecture v2 (6–7 Oct 2026)**, see §13.
2. **M1:** Days 1–5 content and questions (`content:check`, `content:import`), and the engineer day page: Prep, Learn, Mock with copy prompt, Write (saved), the daily quiz (last; from the day's pool), unlocking and the pace note.
3. **M2:** AI scoring of written answers (Anthropic, faked until a key is set), the Day-1 baseline, pauses, Home dashboard.
4. **M3:** the Days 1–5 assessment (60%, retake), scorecard, self-check, Day 6 unlock.
5. **M4:** manager v1: team view, answer review with overrides, unlock with reason, check-ins.
6. **M5:** Days 6–20 content, Gate 1 and repeat blocks, scoring tests. (The admin content editor is deferred: edit the files and re-import.)
7. **M6:** Days 21–40 (healthcare content), Gate 2 with the live-call plan, red flags, emails.
8. **M7:** Days 41–65: live-call paths, readiness case, final review, Day 1 → Day 90.
9. **M8:** pilot with 3–5 engineers and 1 manager for 2 weeks, then full rollout.

---

## 11. Risks, open items, errata

**Risks**

- **Gating edge cases:** no live call available (handled by the paths and the "before the next gate" rule); stuck on an assessment (retake + manager unlock); repeat-block data (kept by attempt number); a manager away at a gate (the admin can record it).
- **Content volume:** about 880 questions. Claude writes them all and they go live on import; the user checks the course from the engineer pages and reports problems (fix = edit `content/` + `pnpm content:import`).
- **AI scoring fairness:** handled by scoring points only, per-point feedback, test answers and overrides. AI scores never block.
- **Real client data:** real-project answers are kept private and **not sent to free models**. AI scoring for them is switched on only once a no-training model is approved.
- **Free-model reliability:** free models can be slow, rate-limited or removed without notice. This is handled by the fallback model list, rate-limited sweeps, calibration runs and admin alerts. AI scores never block progress.
- **Copied prompt:** after copying, the engineer could read the hidden facts. Accepted; every copy is logged.

**Open items**

1. Run the calibration set on Claude Haiku 5.5, and decide whether real-project answers may be AI-scored
2. **Hosting** for the three containers plus Redis: decide before the first deploy.
3. **Production database:** our own Postgres 18 container (offsite backups from day one), the host's managed Postgres, or Supabase (must offer Postgres 18).
4. **Nightly backup location:** GitHub Actions schedule or the worker. Required before any production data exists.
5. ~~Who reviews the AI-drafted questions~~ **Decided (7 Oct 2026, replaces the earlier admin review queue):** no review step in the portal. Everything imported is live; the user goes through the course as an engineer and reports problems, which are fixed in `content/` and re-imported.

**PDF errata to fix in content** (dates and numbers that differ between cards):

- S12 "29 days" → 28
- S24's daylight-saving cause
- UAT Apr 22 vs Apr 24
- S32 May 29 vs May 22
- "1,240 bookings" timing
- visit value $90 vs $120
- 15 vs 17 minutes saved
- S29 training date
- X12 "Yellow" → "Amber"
- X-card dates after the plan ends
- S49/X08/X09 prompts saying "US client on a video call"
- Gate 2 25 min vs rehearsal 20 min
- Gate 1's example card already practised

**Kept as written:**

- Status-answer time targets per lesson (45 seconds early on, 60 seconds later)
- S36 at Level 2
- Level 2 cards after Day 40

---

## 12. Verification

- **Plan:** the user reviews `docs/PORTAL_PLAN.md`.
- **Content:** the Days 1–5 question pools are the first content check.
- **Per milestone:** a click-through demo script. For example, M2: log in as a test engineer, complete Days 1–5, see the quiz unlock last, see AI scores appear and the next day open.
- **Testing stack:**
  - **Vitest** for unit tests (contracts, rules, the web API client and route guards)
  - **Vitest against real local Postgres 18 and Redis 8** (Docker) for row-level-security privacy tests, session functions, the services, the HTTP API (supertest) and the jobs
  - **Playwright** for end-to-end tests at desktop and 390 px width, with axe accessibility checks, against `pnpm dev`
  - the "no test login in production" rule is a unit test now; a production smoke check (headers, CSP, Google redirect) is added with the deployment setup
  - an **AI scoring eval script** (test answers within ±1), run on demand before prompt or model changes
- **Test conventions:**
  - The AI provider and Google login are faked in normal tests.
  - **GitHub Actions** runs everything except the AI eval on every pull request, and merging is blocked on failure.
  - Preview environments per pull request depend on the hosting choice (open item).
- **Automated:**
  - unlock-rule tests (any-order steps, quiz last, 5-day assessments, gates, repeat blocks, pauses, live-day paths, missing steps, Day 65)
  - privacy tests
  - scoring rule tests (gate averages with skipped criteria, final review order, red flags)
  - `pnpm content:check` on every content file
  - AI scoring test set
  - end-to-end tests of the engineer day and the manager override
- **Pilot:** 3–5 engineers for 2 weeks before rollout.

---

## 13. Implementation log

### M0: setup, Google login, roles and teams, database privacy (done 6 Oct 2026)

**Delivered:**

- Next.js 16 app with the §8b design tokens and shared components: IBM Plex, orange accent, no default Tailwind palette.
- Lint bans inline styles and arbitrary values. Stylelint, a pre-commit hook and CI are in place.
- Google sign-in (Auth.js v5), restricted to the company domain.
  - New sign-ins wait as _pending_; the first admins come from `INITIAL_ADMIN_EMAILS`.
  - There is a local-only test login that a production build never offers (checked in CI).
- Three role areas (`/app`, `/manager`, `/admin`). Another role's area returns 403.
- Admin: users and roles (approve, role, access, team, start date) and teams (create, managers). Every change is audited.
- Supabase Postgres with row-level security, the restricted app role, the last-admin guard, and a target date computed from settings plus pause days.
- **Tests:**
  - 41 unit tests
  - 42 database privacy and data-layer tests (every role, the attack cases, a concurrency test)
  - 16 end-to-end tests on desktop and a 390 px phone, with accessibility checks

**Independent review, and what was fixed:**

- **Critical, fixed:** a temporary-table trick could make the database treat an engineer as admin. Fix: pinned `search_path`, TEMP revoked, plus a test.
- **High, fixed:** an open redirect in `/session/refresh`. One same-site redirect helper is now used for every redirect.
- **Medium, fixed:**
  - privileged functions narrowed
  - initial admins moved into a locked table
  - a different Google account for an existing email is refused
  - disabled accounts refused at sign-in
  - the last-admin race closed
  - pause rules added
  - separate audit events for role and status changes
  - pagination on all lists
  - green used only for Done/Passed

**New rules introduced during M0 (to confirm):**

1. **An admin cannot change their own role or disable themselves.** Another admin must do it, which prevents accidental lock-out. The last active admin is also protected.
2. **Approving a new engineer requires a team and a start date** (from §8, now enforced).
3. **Pauses:**
   - they can't overlap
   - they can't start before the engineer's start date
   - each pause is at most **30 days**, an admin setting (`pause.maxDays`)
   - they only apply to an active enrollment

**Technical notes:**

- **Session cookie refresh:**
  - Role and status in the cookie are re-read from the database at least every 60 seconds, and on every request while pending.
  - A mismatch sends the user once through `/session/refresh`, so approvals and role changes apply on the next page without signing in again.
- **No `forbidden()`:** Next.js `forbidden()` is still experimental, so the proxy returns the 403 page itself.
- **CSP:** uses `'unsafe-inline'` for scripts, which Next.js needs without nonces. Moving to a nonce-based CSP is a later hardening step.
- **Hosting outside Vercel:** needs `AUTH_URL` and `AUTH_TRUST_HOST=true`. Vercel is trusted automatically.

### M1: content written once + the engineer day (built 7 Oct 2026)

**Delivered:**

- **All content, Days 1–65,** written from the PDF into `content/`: 13 blocks, 65 days, 61 mock cards (S01–S49, X01–X12), 33 library entries (sections 1–7, 5.1, 7.5, C glossary, D resources, E; templates A1–A13; prompts B1–B8), and **880 questions** (64 daily pools × 10, 12 assessment pools × 20), each quoting its PDF passage. `pnpm content:check` passes; everything is imported and live (the admin review was removed on 7 Oct 2026, see below).
- ~~**Admin content review** (`/admin/content`)~~ **Removed 7 Oct 2026** (user decision): no review states, no admin Content page; everything imported is live. Migration `20261007160000_remove_content_review` dropped the review columns and the `question_status` enum and added `questions.retired`.
- **Engineer:** Home ("Continue Day N", pace note), My plan (Days 1–65 by phase with checkpoints), the day page (Prep, Learn, Mock with copy prompt and the mock log with rubric criteria 1–10, Write with the safety reminder, then the daily quiz), and the quiz (one question at a time, explanations; written answers saved for AI scoring in M2).
- **Rules** (pure, unit-tested): day status and lock reasons, day completion, quiz pick (3 mcq + 1 scenario + 1 written from the day's pool, retired questions excluded), pace.
- **Database:** content tables (read-only to the app, every active user reads them; card prompts admin-only, copied through `app.card_prompt()`), activity tables with RLS (step entries private to the engineer; daily quiz items private; assessment items readable by the engineer's manager and admins).
- **Tests:** 54 unit, 84 database/API (incl. 12 privacy tests for the new tables), 20 end-to-end (desktop + phone, axe). (After the review removal: the end-to-end test is the engineer journey only.)

**Decisions made while building (to confirm):**

- Content rows are stored as validated JSON plus key columns rather than one table per §4 entity (same data, far less code).
- Plan-schedule words become day numbers ("By Day 5"); CareBook story dates stay (§6).
- Errata applied by the content writers: S12 28 days; S22 UAT Apr 24; S24 cause = a reminder-service update that ignored daylight saving time; S41/Day 40 rehearsal 25 min (section 5.3 already said 25; the card index on p18 still says 20); CPARB example 17 minutes; S29 = a 30-minute refresher after the Apr 28 training; S46 "about 900" bookings and $90 visit value; S32 May 22; X12 "Amber" and dates moved inside the plan (X04, X07, X08, X10, X11, X12); S49/X08/X09 prompt openings.
- Live-call days with no PDF fallback (Days 48, 53, 58, 62) say so and offer a substitute card chosen by the writer (53: X10, 58: S32, 62: X12).
- Cards whose client isn't one of the personas (X03, X04, S48, S49, X07, X08, X09) carry a placeholder persona id; their persona line is word for word.

**Passages to compare with the PDF when checking the course** (table cells that the text extraction scrambled): p6 behaviour table; p14–19 scenario library columns; p21 CareBook timeline; p26–62 order of "client may throw" lines; p81 S18 fact sheet labels; p97 S25; p99 S38 options; p138 Day 59 Learn; p150–153 blanks in A1, A2, A7, A8; p155–159 A12 tables; p162 A13; p166 B8; p171–173 Appendix D; p189 X08 fact sheet.

**Review after M1, and what was fixed:** no privacy or security findings. Fixed: two simultaneous final answers (or final step saves) could leave a day incomplete (per-day lock; completion no longer depends on the page having been opened first); (two review-only fixes, "not checked" on changed dependencies and `QUESTION_CHANGED`, were removed with the review on 7 Oct 2026); "today" follows the team's calendar (new setting `plan.timezone`, default `Asia/Kolkata`) instead of UTC. Also fixed during integration: the phone tab bar covered the last button; the quiz now shows the last answer's feedback before "Finish quiz"; a double "start quiz" no longer errors; Vite pre-bundles all route dependencies at start-up.
