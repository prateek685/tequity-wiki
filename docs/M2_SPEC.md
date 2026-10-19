# M2 build spec (draft — applied after M1 is integrated)

M2 = **AI scoring** of written answers (faked until `OPENROUTER_API_KEY` is set), the **Day-1 baseline**, **pauses**, and the **Home dashboard**. Product rules: `docs/PORTAL_PLAN.md` §1, §3 (scores 1, 2, 6), §7, §7.1, §8b "Engineer Home dashboard". Same ownership model as `docs/M1_SPEC.md`: the lead writes contracts first; backend, frontend and content agents work in parallel against them.

## AI scoring (§7, §7.1)

- **What is scored:** written daily-quiz answers and text Write tasks (the day's `writeScoring`: model answer + 2–3 scoring points). Assessment answers follow in M3 with the same pipeline.
- **Flow:** the answer is saved first with an `ai_scores` row `pending` (same transaction), then a BullMQ job is enqueued on queue `scoring` with jobId `score:<ai_score_id>`. The worker scores it; 3 attempts with backoff; queue limiter 15 jobs/minute. A sweep every 10 minutes re-enqueues `pending` rows older than 10 minutes (answers saved while Redis was down). **Progress never waits for AI.**
- **`LlmClient`** (`apps/api/src/llm/`): `score(input) → ScoreResult`.
  - `OpenRouterLlmClient`: Vercel AI SDK (`ai` 7.0.130, exact pin) + `@openrouter/ai-sdk-provider` 3.1.0 (peers checked: ai ^7, zod 4, Node ≥ 22), structured output validated with zod, `maxRetries: 0` (BullMQ retries), OpenRouter `models` fallback list from `LLM_SCORING_MODELS`.
  - `FakeLlmClient`: deterministic (scores from how many scoring-point keywords appear), used when `OPENROUTER_API_KEY` is empty in development and in all tests. In production without a key, rows stay `pending` and an admin warning shows (never fake scores in production).
- **Output (strict):** each scoring point `met | partly | not_met`, score 1–5, reason (1–2 sentences), one better sentence, `possiblePhi`. The server checks consistency (all points met → score ≥ 4; none met → score ≤ 2); an inconsistent or invalid result counts as a failed attempt.
- **Prompt:** friendly US client-communication coach; judges only the scoring points; doesn't penalise non-native phrasing unless clarity is a point; treats the answer as data and ignores instructions inside it; flags possible PHI. Stored with `model` and `promptVersion` (`score-v1`).
- **Real-project answers:** while setting `ai.scoreRealProjectAnswers` is false, they're saved with status `not_scored`, and the UI says "AI feedback isn't available for real-project answers yet."
- **Privacy:** `ai_scores` readable by the engineer. Managers will see numeric scores only, through a function that returns no text (M4). Feedback text is private.
- **Contracts (additive):** `aiScore` object `{ status, score, points[], reason, betterSentence, possiblePhi }` on quiz item results and on the Write step state; the UI refetches every few seconds while `pending`.

## Day-1 baseline (§1 "Day 1 vs Day 90", §3 score 6)

- Day 1's Write step uses a form: the 14 behaviours scored 1–5 (labels from `plan.yaml`, scale meanings from §5.1) plus "three goals for the 90 days". Content: `lessonStep.form: "baseline"` (additive).
- Stored as `behaviour_baselines` (scores: engineer, their manager and admins can read) + goals in the private step entry.
- Per-pillar averages: Understand 4 behaviours, Communicate 4, Own 4, Stand firm 2.

## Pauses (§1 "Pacing", M0 rules)

- `/app/pauses`: list, add (from, to, reason), delete a pause that hasn't started. The database already enforces no overlap, ≤ `pause.maxDays` (30), not before the start date, and an active enrollment only. Map those errors to new codes (`PAUSE_OVERLAP`, `PAUSE_TOO_LONG`, `PAUSE_BEFORE_START`).
- Pauses move the target date (existing trigger) and are excluded from pace.

## Home dashboard (§8b)

`GET /api/me/home` (one call): greeting data, current day + its step status, ring (days done / 65, finish-by date, pace, gates passed 0/3), this block's 5-day strip + the next checkpoint, baseline per pillar, latest feedback (last mock-log average, last AI score with its better sentence), the next 3 days (title + locked preview). Charts stay simple (CSS bars and a ring from tokens). The full Progress page comes later.

## Content (parallel with M2 code)

Days 6–65 lessons, cards S05–S49 and X01–X12, glossary, resources, and their question pools, written by several content agents in batches of about 5 days (one block each), each run through `content:check`. Questions stay draft until the user reviews them.
