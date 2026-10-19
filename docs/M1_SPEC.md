# M1 build spec (shared by every agent)

M1 = one usable engineer journey for **Days 1–5**: content written once from the PDF, ~~the admin review page~~ (removed 7 Oct 2026: everything imported is live), and the engineer day page (Prep / Learn / Mock with copy prompt / Write, then the daily quiz last), with unlocking and the pace note. Product rules: `docs/PORTAL_PLAN.md`. Coding rules: `CLAUDE.md`.

**The sync point is `packages/contracts`** (`content.ts`, `learning.ts`, `content-admin.ts`, `errors.ts`) and `packages/content` (YAML file schemas + `content:check`). Backend implements exactly these contracts; frontend calls exactly these contracts. Do not change them. If a change is truly needed, make it additive (new optional field / new endpoint), rebuild with `pnpm --filter @portal/contracts build`, and list it in your final report.

## Ownership (agents run in parallel on one working tree)

| Area                                                                                      | Owner                |
| ----------------------------------------------------------------------------------------- | -------------------- |
| `apps/api/**` (migration, import script, modules, tests)                                  | backend agent        |
| `apps/web/**` (routes, features, components)                                              | frontend agent       |
| `content/plan.yaml`, `content/blocks`, `content/days`, `content/cards`, `content/library` | lesson-content agent |
| `content/questions/**`                                                                    | question agent       |
| `packages/contracts`, `packages/content`, root config, docs                               | lead (me)            |

Never edit files outside your area. Never run `pnpm add` (dependencies are already installed; `react-markdown` + `remark-gfm` are in web). Never run `prisma migrate reset`, never delete Docker volumes, no git commits.

## Endpoints (all under `/api`, cookie session; mutating calls need header `x-portal-request: 1`)

Engineer (`@Roles("engineer")`):

| Method + path                              | Request                                  | Response                             |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------ |
| GET `/me/plan`                             | —                                        | `myPlanResponse`                     |
| GET `/me/days/:day`                        | `dayParam`                               | `dayViewResponse`                    |
| PUT `/me/days/:day/steps/:kind`            | `saveStepRequest` (kind must match path) | `stepState`                          |
| POST `/me/days/:day/prompt-copy`           | —                                        | `promptCopyResponse`                 |
| POST `/me/days/:day/quiz`                  | —                                        | `quizViewResponse` (start or resume) |
| POST `/me/quiz/:attemptId/items/:position` | `answerQuizItemRequest`                  | `answerQuizItemResponse`             |

Admin (`@Roles("admin")`):

| Method + path                           | Request            | Response |
| --------------------------------------- | ------------------ | -------- |
| ~~`/admin/content/*` review endpoints~~ | removed 7 Oct 2026 | —        |

## Rules (pure functions in `apps/api/src/rules/`, unit-tested)

**Day status** (per day 1–65, for the engineer's active enrollment):

- `done` when the day is completed (see below).
- Day 1 is `locked` with reason `start_date` before the enrollment start date; otherwise open.
- Day N > 1 is open when Day N−1 is done **and** checkpoints after N−1 are cleared: if N−1 is a multiple of 5 (5, 10 … 60) the assessment for N−1 is passed (`assessment`) and its scorecard submitted (`scorecard`); after Day 20 Gate 1 passed, after Day 40 Gate 2 passed (`gate`). Otherwise `locked` with `previous_day` or the first uncleared checkpoint reason. (M1 has no assessments yet, so Day 6 stays locked with `assessment`.)
- An open day whose lesson is not imported is `not_ready` (there is no review: everything imported is live).
- `currentDay` = lowest open day, else null.
- Opening a day for the first time records it in `day_progress`.

**Completing a day:** every step the day has (Prep, Learn, Mock, Write — any order) is saved as done, then the daily quiz is completed (all its items answered). Day 65 has no quiz: done when its steps are done. Steps can be re-saved (edited) any time; locked/not_ready days reject saves (`DAY_LOCKED` / `DAY_NOT_READY`).

**Daily quiz:** `locked` until all steps done (`STEPS_NOT_DONE` if started early). Picks 5 questions from the day's pool at random (every question except `retired` ones): 3 mcq, 1 scenario, 1 written, in that order. If the pool can't supply that mix → `not_ready` (`QUIZ_NOT_READY`). No pass mark. Each item is answered once (`QUIZ_ALREADY_ANSWERED`). mcq/scenario: return correct?, correctIndex and an explanation for every option. Written: save the text, `scoreStatus: "pending"` (AI scoring comes in M2), return the model answer. When the last item is answered the attempt completes and, if steps are done, the day completes (`dayCompleted: true`). Correct answers are never sent before answering.

**Pace** (settings `plan.targetDays` = 90, `pace.behindToleranceDays` = 3): `not_started` before the start date. Otherwise elapsed = calendar days since start (inclusive) minus pause days so far; `expectedDone = min(65, floor(65 × elapsed / targetDays))`; `difference = expectedDone − daysDone`; `behind` if difference > tolerance, `ahead` if difference < 0, else `on_pace`.

**Prompt copy:** only for an open or done day with a mock card. Returns the card's private prompt; audited as `prompt.copied` (entity `card`, id = card id, after = `{ day }`).

~~**Admin review**~~ **Removed (user decision, 7 Oct 2026):** no review states and no review audit actions. Everything imported is live; the user checks the course from the engineer pages and reports problems (fix = edit `content/` + `pnpm content:import`).

## Data and privacy (backend)

Content tables (imported by `pnpm content:import` as the owner via `DIRECT_URL`; the app role can only read them): plan, blocks, days, cards, **card prompts (admins only)**, library entries, questions (every active user). Content rows hold validated JSON (`jsonb`) plus key columns; the shapes are the contracts. Import is re-runnable and everything imported is live: a changed row replaces the old one; a changed question gets `version + 1`; a removed question is deleted, or `retired` if it was already asked. (The review columns and `question_status` were dropped in `20261007160000_remove_content_review`.)

Activity tables, all with RLS + FORCE: `day_progress` (owner rw; manager of the engineer + admin read), `step_entries` 🔒 (owner only — no manager or admin read), `rubric_scores` (mock self-scores 1–10; owner rw; manager + admin read), `quiz_attempts` (owner rw; manager + admin read), `quiz_items` (owner rw; daily items 🔒 owner only; assessment items readable by the engineer's manager and admins). Privacy tests for: step entries, daily quiz items, card prompts, and that nobody in the app can change content.

## UI (frontend)

- Engineer nav: Home (`/app`), My plan (`/app/plan`). Day page `/app/day/$day`, quiz `/app/day/$day/quiz`.
- Home: "Day N of 65" + title + primary "Continue Day N" button, pace note ("On pace" / "N days behind" / "N days ahead", finish-by date), this block's 5-day strip. Not enrolled → existing notice.
- My plan: Days 1–65 grouped by phase (Phase 1 = 1–20, 2 = 21–40, 3 = 41–65), status pill per day, checkpoints (assessment after every 5th day, Gate 1 after 20, Gate 2 after 40) shown between days. Never show week numbers or weekday names.
- Day page: block goal + frameworks, steps as cards (any order) with done state; Prep notes textarea; Learn = lesson text + linked library entries (sections/templates/prompts expandable) + "Mark as done"; Mock = card brief (story, fact sheet, goal, client may throw, example script, what good looks like) + **Copy AI prompt** button (never shows the prompt) + mock log form (went well, one thing to fix, optional reflection showing the block's log question, rubric criteria 1–10 each 1–5 or "didn't come up"); Write = task text + textarea + safety reminder (CareBook: "Practice only: use CareBook details. No real client or patient data." / real project: "Real project is fine: anonymise names, no patient data, credentials or confidential documents."). Daily quiz card last, locked until the four are done.
- Quiz page: one question at a time, explanation after each answer, finish → back to day / next day.
- ~~Admin nav adds "Content" (`/admin/content`)~~ (removed 7 Oct 2026): table of days (reviewed?, question counts draft/approved/rejected, assessment counts); day detail = the lesson exactly as engineers see it (reuse the same components) + PDF page refs + card prompt (admin only, collapsible) + "Mark lesson checked" + every question with options (correct one marked), explanations, model answer, scoring points, source quote + page, status, Approve / Reject (note required) / Reset.
- Design rules in `CLAUDE.md` / plan §8b: tokens only, no arbitrary values, no inline styles, 390px, loading/empty/error states, Markdown via `react-markdown` + `remark-gfm` styled with tokens.

## Rubric criteria (for the mock log form; from PDF §6)

1 Opening and agenda · 2 Answer-first structure · 3 Questions asked · 4 Playback · 5 Business link · 6 Trade-offs · 7 Handling unknowns · 8 Risks and bad news · 9 Disagreement · 10 Closing and next steps · (11 Written follow-up: gates only)
