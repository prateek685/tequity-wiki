# Prompt for Claude Code: Plan the "Client-Ready Engineer" Training Portal

> **How to use this:** Create a new project folder. Put the plan PDF in `docs/plan.pdf` (and the Markdown versions of the plan, if you have them, in `docs/plan-md/`). Open Claude Code in that folder, switch to **plan mode**, and paste everything below the line.

---

You are helping me plan an **internal training portal** for the engineers at my company. **Do not write application code yet.** Your job in this session is to read the source material, ask me the questions you need answered, and then write a clear build plan that we will review together before any coding starts.

## 1. Background

Our company works with US healthcare clients. Our engineers are technically strong, but they need to get better at client-facing communication, because on many projects there is no project manager between the engineer and the client.

I wrote a **90-day plan** called _"Client-Ready Engineer"_ to fix this. It is in `docs/plan.pdf` (198 pages). Until now I have used it alone with an AI chat assistant. I now want every engineer in the company to follow it through a portal.

**Read the whole plan before planning.** Pay special attention to:

- Section 3: the Client Readiness Model (4 pillars: Understand, Communicate, Own, Stand firm; 14 behaviours)
- Section 4: the daily 45-minute block (Prep 5 min, Learn 10 min, Mock 10–15 min, Write 10 min)
- Section 5: the weekly self-scorecard, bi-weekly check-ins, phase gates, red-flag signals, and the 13-week tracker
- Section 6: the call rubric (11 criteria, scored 1–5)
- Section 7: the AI mock session kit (personas, difficulty levels, scenario library, mock cards with public and private parts)
- Sections 8–10: the week pages (Weeks 1–13), each with a goal, frameworks, a day-by-day table, resources, and mock cards
- Appendices A–E: templates, prompts, healthcare glossary, resources, extra scenarios

**All plan content is practice content.** Everything is based on a made-up client story ("CareBook" / Brightpath / Lakeside). There is no real client or patient data in the portal. Some lines in the plan mention using real project messages or real client calls; in the portal, always use the CareBook practice version instead (see section 4 below).

## 2. What the portal is

An internal web portal where each engineer works through the 13-week plan day by day, takes a short quiz each day and an assessment each week, gets their written answers scored by AI, and sees their progress. Managers see their team's progress and can adjust scores. An admin manages the content and the users.

**Internal only.** Company engineers, managers and admins. Not a product for other companies. We do not need multi-tenancy, billing, or public sign-up.

## 3. Decisions already made (v1)

Treat these as requirements. If you think one is a mistake, say so and explain why, but do not silently change it.

### 3.1 The day page

Each plan day (Monday–Friday, 13 weeks) becomes one page with these steps, in order:

| Step           | What happens in the portal                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Prep**       | A short task from the plan with a text box. Saved to the engineer's private journal.                                                                                                                   |
| **Learn**      | A lesson page: the week's frameworks (e.g. BLUF, PREP, the 3-step call opener), the day's reading, and resource links.                                                                                 |
| **Daily quiz** | About 5 questions based on that day's Learn content (see 3.2).                                                                                                                                         |
| **Mock**       | v1: shows the **public brief** of the day's mock card. The engineer runs the call outside the portal, then logs a self-score on each rubric criterion that came up, plus "one thing to fix next time." |
| **Write**      | The engineer submits the day's writing drill (e.g. a recap email, a BLUF rewrite). AI scores it against the rubric.                                                                                    |

Phase 3 live-call days are logged only: date, role (shadow / co-lead / lead), self-scores, one thing to fix. No call content is stored.

### 3.2 Daily quiz

- About 5 questions: **3 multiple-choice concept questions**, **1 scenario question** (a client says something; pick the best of 4 replies), **1 short written answer** (e.g. "Rewrite this message BLUF-style").
- **Must be completed** to unlock the next day. **No minimum score.**
- Every multiple-choice option has an explanation that is shown after answering.
- Questions come from a **pool** (more questions than are shown), so a retake shows different questions.

### 3.3 Weekly assessment (Friday)

- About 10 questions covering the whole week (mostly scenario questions, plus 2 written answers), followed by the **weekly self-scorecard** from section 5.1 of the plan (1–5 per pillar with 1–2 lines of proof, days completed, mocks done, biggest win, where I'm stuck).
- **Must be completed with a minimum score of 60%** to unlock the next week. The 60% is calculated on the **multiple-choice part only**, so an unfair AI score on a written answer can never block anyone. Written answers are still scored and shown.
- If the engineer does not reach 60%, they can **retake after one day**, with fresh questions from the pool.
- The 60% threshold should be configurable by an admin.

### 3.4 Phase gates

- Gates (end of Week 4, end of Week 8, Day 90) are run **live, outside the portal**, as the plan describes. The manager records the result and rubric scores in the portal.
- A gate result is required to unlock the next phase (Week 5 and Week 9).
- Outcomes follow section 5.3 of the plan: Pass / Pass with focus areas / Repeat 2 focus weeks / and the three Day-90 outcomes. "Repeat 2 focus weeks" sends the engineer back to their two weakest weeks, then the gate is re-run.

### 3.5 Evaluation

- **Multiple choice:** scored automatically.
- **Written answers:** scored 1–5 by AI. For each written question, the admin stores a **model answer** and **2–3 scoring points** (e.g. "Answer comes first", "No jargon"). The AI returns a score, a short reason, and one improved sentence, in the same coaching style as the plan's rubric feedback.
- **Manager override:** a manager can change any AI score on a weekly-assessment written answer and add a note. The engineer sees both the AI score and the manager's score and note. All overrides are kept in a history.
- Progress is based on **submitting**, never on waiting for a manager review.

### 3.6 Roles and visibility

| Role         | Can do                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Engineer** | See today's day page and do all steps; see their own progress, quiz history, scores, journal, and scorecard trend.                                                                                                                        |
| **Manager**  | Team dashboard: days completed, quiz and assessment scores, scorecards, pillar trends, Green / Amber / Red status, check-in notes, gate results. Override AI scores. Manually unlock a day or week for one engineer, with a saved reason. |
| **Admin**    | Edit all content (lessons, quizzes, question pools, model answers, scoring points, mock cards, resources); manage users, teams and manager assignments; set each engineer's start date; change settings such as the pass threshold.       |

**Privacy rule (important):** Managers see completion, scores and scorecards for everything, but can **read the written answers only from the weekly assessment**. Daily quiz answers, Prep entries, the journal and mock logs stay **private to the engineer** (managers see only completion and scores for those). This matches the plan's principle: "private practice, visible progress."

### 3.7 Pacing and unlocking

- Self-paced, individual. Each engineer has their own start date.
- Days unlock **in order**: a day unlocks when the previous day's required steps are done (daily quiz completed, mock logged, Write submitted).
- No hard calendar locks. Show a gentle note if the engineer is behind their expected day (based on start date).
- Managers and admins can manually unlock, with a reason that is saved.

### 3.8 Red flags

Detect the signals from section 5.4 of the plan automatically where the data allows, and show them on the manager dashboard. For example: scorecard missing 2 weeks in a row; fewer than 3 practice days a week for 2 weeks; the same pillar at 2 or below for 3 weeks; self-score and gate score differ by 2 or more; a gate not passed.

### 3.9 Data safety

All content is practice content. Still, show a one-line reminder on every written answer box: _"Use CareBook practice details only. No real client or patient data."_

## 4. Content rules

- Every Prep, quiz and Write task uses the **CareBook practice story**. Where the plan offers a fallback such as "No project yet? Use messy messages 1, 2 and 5 in section 7.5", the portal uses **only** the fallback.
- Quiz questions must be written **from the plan's content**: the week's goal, frameworks, the day's Learn material, the glossary, and the CareBook story. Do not invent facts that are not in the plan.
- The total is roughly 65 daily quizzes and 13 weekly assessments, which is about 450 questions shown, plus extra questions for the pools. Plan a content pipeline for this (see section 6, step 4).

## 5. Planned for later (NOT in v1)

**AI mock client calls inside the portal.** In a later version, the engineer will run the mock call in the portal, with AI playing the client from the card's private part (voice or text), followed by rubric feedback.

v1 must be designed so this can be added without rebuilding:

- Store mock cards in the portal from day one, split into the **public brief** (title, client, level, story so far, fact sheet, goal, what the client may throw at you) and the **private part** (hidden facts, curveballs, the client's secret agenda, how the client opens). **Only admins can see the private part.**
- Store mock logs using the **same rubric criteria** that the future AI feedback will use, so self-logged and AI-scored mocks appear on the same progress charts.
- Keep a "Mock" step on the day page that can later get a "Start call" button.

## 6. What I want from you in this session

Work in this order. **Stop after step 1 and wait for my answers.**

1. **Read the plan, then ask me questions.** Ask only about things that change the design: for example, the tech stack and hosting, company login (Google Workspace or Microsoft), which AI provider we use for scoring, expected number of users, and anything in the plan or this brief that is unclear or contradicts itself. Group your questions and keep them short.

2. **Content model.** Propose how the plan's content becomes structured data: phases, weeks, days, steps, frameworks, resources, mock cards (public/private), rubric criteria, pillars and behaviours, glossary terms, quiz questions (types, options, explanations, model answers, scoring points), and question pools.

3. **Data model.** Users, roles, teams, start dates, progress, unlocks (including manual unlocks with reasons), submissions, AI scores, manager overrides (with history), scorecards, gate results, check-in notes, red flags, and settings. Show how the privacy rule in 3.6 is enforced in the data and API layers, not just hidden in the UI.

4. **Content pipeline.** How we turn the 198-page PDF into structured content, and how quiz questions are drafted (AI-assisted from the plan), reviewed by a human, and published through the admin editor. **The first milestone is Week 1 only:** 5 daily quizzes and 1 weekly assessment, so I can check the style and difficulty before the rest is written.

5. **AI scoring design.** The scoring prompt, the input (question, model answer, scoring points, engineer's answer), the output format, how to keep scores consistent, how to handle failures and retries, and a rough cost estimate per engineer for the full 13 weeks.

6. **Architecture.** Recommend a stack (with one alternative and the trade-offs), explain authentication, hosting, and how the future mock-call feature will plug in.

7. **Screens.** List the main screens for each role, with a one-line purpose for each.

8. **Milestones.** Break v1 into small milestones that each deliver something I can click through, starting with Week 1 end to end for one engineer.

9. **Risks and open questions.** Anything that could cause problems: gating edge cases (holidays, leave, repeat weeks), AI scoring fairness, content volume, privacy.

Write the final plan to `docs/PORTAL_PLAN.md`. Use simple, clear English and keep it practical.
