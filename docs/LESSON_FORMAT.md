# Lesson format: the story course (decided 8 Oct 2026)

The portal is a **course player**: a course outline on the left (phase → week → day → lessons), one lesson at a
time on the right, Previous / Next at the bottom. The approved mockup is
https://claude.ai/artifact/RrQFk8Fett7YwUkZuKbruq (Week 1, Days 1–5); a local copy is `docs/design/course-player.html`.
Match its layout, sizes and copy style.

**The course is one story.** The engineer is the lead engineer on CareBook (PDF §7.5). Each day is a dated
episode (`storyDate`, e.g. "Tuesday, March 3", a story date, not the engineer's calendar). The first lesson of a
day opens with a `yesterday` line and a `scene`; mock cards carry "the story so far" and a fact sheet.

Lessons are **written for the portal**, not copied from the PDF. The PDF is the source of the teaching; the portal
does the mechanics. Never tell the engineer to set something up by hand, keep a journal, save a prompt, or "see
section N / Appendix X". Short text, normal reading sizes, plain words. Templates become forms.

Lessons are done **in order** (Next saves the lesson and moves on). The daily quiz is the last item of every day.
While the `learning.unlockAll` setting is `true` (content review), every imported day and lesson is open.

## Files (`content/`)

```
content/plan.yaml               phases, pillars, the 14 behaviours, the 1–5 scale, rubric criteria
content/blocks/block-01.yaml    a week (Days 1–5): number, title, phase, goal
content/days/day-01.yaml        one day: story date + lessons
content/cards/S01.yaml          a mock card: story so far, fact sheet, client, script + the AI prompt
content/questions/day-01.yaml   the daily quiz pool (10 questions: 6 mcq, 2 scenario, 2 written)
content/library/<id>.yaml       a Library page: framework, template, prompt, glossary or resource
```

### days/day-NN.yaml

```yaml
day: 2
block: 1 # the week
title: Answer first # short, shown in the outline
type: normal
storyDate: Tuesday, March 3
minutes: About 45 min
intro: >- # 1–2 lines (My plan page)
  …
lessons:
  - id: dana-in-a-hurry # unique in the day; the key the entry is saved under
    kind: prep # read | prep | learn | mock | reflect | write | rate | scorecard | live
    title: Dana is in a hurry # short: the outline and "Next: …"
    heading: … # optional longer page heading
    minutes: 5 min
    lead: … # optional, one paragraph under the title
    blocks: # what the lesson shows, top to bottom
      - { type: yesterday, text: … }
      - { type: scene, when: "Tuesday, March 3 · between meetings", text: … }
      - { type: text, text: … }
    fields: # inputs (optional unless required: true)
      - { id: q1, label: Question 1, kind: line, placeholder: "e.g. Are we on track for April 27?" }
scoring: # optional, server only: how a write lesson is AI-scored (M2)
  rewrite-messages: { modelAnswer: …, scoringPoints: […, …] }
```

**Blocks:** `scene {when, text}` · `yesterday {text}` · `text {text}` · `heading {text}` ·
`facts {label?, rows: [{label, value, warn?}]}` · `timeline {items: [{title, text, state: done|now|next}]}` ·
`people {items: [{initials, name, role, tag?, you?}]}` · `steps {items: [{title, text}]}` (2–6 framework boxes) ·
`compare {before, after, beforeLabel?, afterLabel?}` · `example {text}` (a good line, green) ·
`note {tone: info|warn, title?, text}` · `watch {url, title, meta}` · `message {label, text}` (a messy message) ·
`copy {label, text}` (copyable, not secret) · `pillars` · `behaviours` (from plan.yaml) ·
`recall {label, day, lesson, fields: [{id, label}]}` (the engineer's own earlier answers) ·
`field {id}` (shows one of the lesson's fields inline at that point; the rest render after the blocks) ·
`pillarCompare {label?}` (the engineer's Day-1 baseline next to their latest scorecard, per pillar).

Scorecard and rate lessons show their blocks **after** the ratings and fields (closing notes).

**Inputs:** `fields` · `checksTitle` + `checks` (ticks, never required) · `rounds: N` (repeat-the-call: score 1–5
and the AI's one fix per round) · `rubric: true` (reflect: the AI's call scores, criteria 1–10, optional) ·
`baseline: true` (rate: all 14 behaviours, required) · `scorecard: [C1, C4]` (rate these, next to the Day-1
baseline, required).

**Mock lessons:** `cardId`, `level`, `brief` (false = only "Make the call", for repeat drills), `callStep`
(an extra 4th call step), `scriptNote` (the folded "Example script" summary, e.g. "Open it after your
call to compare."). The player renders the card: fact sheet + client panel (goal, "She may ask"), "Make the call"
(3 steps + Copy prompt), the folded script. Usually followed by a `reflect` lesson using the card's "what good
looks like" as `checks`.

**Live lessons (Phase 3, `type: live_call` days 43, 45, 48, 50, 53, 55, 58, 60, 62):** `liveRole`
(shadow | co_lead | lead | solo), `substituteCardId` (the PDF fallback card, or a CareBook substitute), `fallback`
(the PDF's "no live call?" line). The player shows the role, the Gate 2 live-call plan and the 4 paths (had the
call / another team's call / later / substitute, which shows the card); `fields` are the call sheet (e.g. A9).
"Later" lets the next day open but must be updated before the final review; 2 deferrals or substitutes raise
the red flag `avoiding_live`.

**Readiness case (Days 63–64, A11):** Day 63 drafts it in a write lesson; Day 64's lesson has the same `fields`,
`prefillFrom: {day: 63, lesson: <id>}` (starts from the draft) and `shareReadiness: true` (saving shares the
fields with the manager and opens the final review).

**The usual day:** story + prep → learn → mock → reflect → write → quiz. Day 1 differs (meet CareBook, pillars,
call, reflect, baseline); Fridays add a `scorecard`.

### cards/SNN.yaml

```yaml
id: S02
title: Rapid-fire status questions
client: Dana Brooks
clientRole: VP of Product, Brightpath Health
clientInitials: DB
clientPronoun: She
clientMood: >- # how they behave, 1–2 lines
level: 1
minutes: 10–15 min
storySoFar: >- # the scene, 2–3 lines
facts: # "What you know before the call"
  - { label: Main risk, value: "…", warn: true }
yourGoal: >-
mayAsk: ["…"] # 3 lines
script: [{ step: Open, line: "…" }]
whatGood: ["…"] # 4 ticks
prompt: | # the AI prompt, word for word from the PDF; copy-only for engineers
```

### library/<id>.yaml

`{id, kind: framework|template|prompt|glossary|resource, ref?: "A1", title, summary, day?: first day used,
blocks: [...]}`. Any lesson block except `recall`, `field` and `pillarCompare`; `pillars`/`behaviours` show
nothing there. Templates are shown, not filled in (the lessons turn them into forms).

### questions/day-NN.yaml

**Every question puts the engineer in a client moment** ("Dana asks X. Which reply is best?"). Never ask about
the plan or portal itself. Wrong options are real habits the plan wants to break (background first,
over-apologising, guessing, jargon, hiding risks). Never repeat what the day's lessons already ask for.

Each question quotes its PDF passage (`source.quote` + `page`); 4 options with 1 correct and an explanation each;
written ones have a model answer and 2–3 scoring points.
