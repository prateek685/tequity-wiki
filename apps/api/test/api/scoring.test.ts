/**
 * AI scoring end to end (real NestJS app, local Postgres, the fake scorer): a written quiz answer and a
 * write lesson are saved with a `pending` score, the scoring processor scores them, and the day, quiz,
 * progress and home responses show the result. Also: unchanged answers aren't re-scored, real-project
 * answers aren't scored, the last failed attempt marks the row failed, and the sweep re-queues old
 * pending rows. Runs with `learning.unlockAll` on. Uses test/content-fixtures.ts and the dev login.
 */
import { Test } from "@nestjs/testing";
import {
  answerQuizItemResponse,
  CSRF_HEADER,
  dayViewResponse,
  homeResponse,
  lessonState,
  progressResponse,
  quizViewResponse,
} from "@portal/contracts";
import { type Job, Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { MaintenanceProcessor } from "../../src/jobs/maintenance.processor.js";
import { JOB, QUEUE, redisConnection } from "../../src/jobs/queues.js";
import { FakeLlmClient } from "../../src/llm/fake-llm-client.js";
import { type LlmClient } from "../../src/llm/llm-client.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { type RedFlagRunner } from "../../src/red-flags/red-flag-run.js";
import { ScoringQueue } from "../../src/scoring/scoring-queue.js";
import { scoreJobId, type ScoreRef } from "../../src/scoring/scoring.js";
import { ScoringProcessor } from "../../src/scoring/scoring.processor.js";
import { BEHAVIOUR_IDS, ContentFixtures, QUESTIONS, WRITE_SCORING } from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("sc");
const content = new ContentFixtures();
const ORIGIN = env.PORTAL_ORIGIN;
const prisma = new PrismaService(env);
const logger = new PinoLogger({ pinoHttp: { level: "silent" } });
const processor = new ScoringProcessor(prisma, new FakeLlmClient(), logger);
let app: NestExpressApplication;
let cookie = "";

const get = (path: string) => request(app.getHttpServer()).get(path).set("Cookie", cookie);
function send(method: "post" | "put", path: string, body: object = {}) {
  const server = request(app.getHttpServer());
  return (method === "post" ? server.post(path) : server.put(path))
    .set("Cookie", cookie)
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);
}

interface Row {
  id: string;
  status: string;
  revision: number;
  score: number | null;
  model: string | null;
  prompt_version: string | null;
}

async function scoreRows(target: string): Promise<Row[]> {
  const { rows } = await fx.owner.query<Row>(
    `SELECT id, status, revision, score, model, prompt_version FROM ai_scores
     WHERE user_id = $1 AND target = $2 ORDER BY created_at`,
    [fx.id("eng"), target],
  );
  return rows;
}

async function lessonRow(): Promise<Row> {
  const row = (await scoreRows("lesson"))[0];
  if (!row) throw new Error("no lesson score");
  return row;
}

const job = (ref: ScoreRef, attemptsMade = 0) =>
  ({ data: ref, attemptsMade, opts: { attempts: 3 } }) as unknown as Job;
const refOf = (row: Row): ScoreRef => ({ aiScoreId: row.id, userId: fx.id("eng"), revision: row.revision });

/** Score a row as the worker would. A dev worker may have scored it first ("stale"); both are fine. */
async function score(row: Row, client: ScoringProcessor = processor): Promise<string> {
  return client.process(job(refOf(row)));
}

const REWRITE = "/api/me/days/2/lessons/rewrite";
const GOOD_ANSWER = "The release date is Friday, and the login fix is done.";

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("eng", "engineer", "active");
  const yesterday = isoFromDate(new Date(Date.now() - 86_400_000));
  await fx.owner.query("INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2)", [
    fx.id("eng"),
    yesterday,
  ]);
  await content.install();
  await content.setUnlockAll(true);

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  const response = await request(app.getHttpServer())
    .post("/api/auth/dev-login")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send({ email: fx.emailOf("eng") });
  cookie =
    (response.get("Set-Cookie")?.find((value) => value.startsWith("cr_session=")) ?? "").split(";")[0] ?? "";
});

afterAll(async () => {
  await app.close();
  await prisma.onModuleDestroy();
  await fx.cleanup();
  await content.restore();
});

describe("written quiz answers", () => {
  it("are saved with a pending score, then the processor scores them", async () => {
    const quiz = quizViewResponse.parse((await send("post", "/api/me/days/1/quiz")).body);
    for (const item of quiz.items) {
      const q = QUESTIONS.find((candidate) => candidate.stem === item.stem);
      const body =
        item.type === "written"
          ? { text: "Point one is covered, and point two as well." }
          : { choice: q && "options" in q ? q.options.findIndex((o) => o.correct) : 0 };
      const answered = answerQuizItemResponse.parse(
        (await send("post", `/api/me/quiz/${quiz.attemptId}/items/${item.position}`, body)).body,
      );
      if (item.type === "written") expect(answered.result.aiScore).toMatchObject({ status: "pending" });
      else expect(answered.result.aiScore).toBeNull();
    }
    const [row] = await scoreRows("quiz_item");
    if (!row) throw new Error("no quiz score");
    // Pending until scored (a running dev worker may score it first).
    expect(row).toMatchObject({ revision: 1 });
    expect(["pending", "scored"]).toContain(row.status);

    expect(["scored", "stale"]).toContain(await score(row));
    expect(await scoreRows("quiz_item")).toEqual([
      { ...row, status: "scored", score: 5, model: "fake/keyword-scorer", prompt_version: "score-v2" },
    ]);
    // Scoring the same job again does nothing.
    expect(await score(row)).toBe("stale");

    const view = quizViewResponse.parse((await send("post", "/api/me/days/1/quiz")).body);
    const written = view.items.find((item) => item.type === "written");
    expect(written?.result).toMatchObject({
      scoreStatus: "scored",
      aiScore: {
        status: "scored",
        score: 5,
        points: [
          { point: "Point one", verdict: "met" },
          { point: "Point two", verdict: "met" },
        ],
        possiblePhi: false,
      },
    });
    expect(written?.result?.aiScore?.betterSentence).toBeTruthy();
  });
});

describe("write lessons with a scoring guide", () => {
  it("are scored once saved; the model answer comes with the score", async () => {
    const saved = lessonState.parse((await send("put", REWRITE, { values: { answer: GOOD_ANSWER } })).body);
    expect(saved).toMatchObject({
      aiScore: { status: "pending" },
      modelAnswer: WRITE_SCORING.rewrite.modelAnswer,
    });
    const row = await lessonRow();
    expect(["scored", "stale"]).toContain(await score(row));
    const day = dayViewResponse.parse((await get("/api/me/days/2")).body);
    expect(day.progress.find((item) => item.id === "rewrite")).toMatchObject({
      aiScore: { status: "scored", score: 5 },
      modelAnswer: WRITE_SCORING.rewrite.modelAnswer,
    });
  });

  it("aren't scored again when the text is unchanged; a changed text gets a new revision", async () => {
    const before = await lessonRow();
    await send("put", REWRITE, { values: { answer: GOOD_ANSWER } });
    expect(await lessonRow()).toEqual(before);

    const changed = lessonState.parse(
      (await send("put", REWRITE, { values: { answer: "Sorry for the delay." } })).body,
    );
    expect(changed.aiScore).toMatchObject({ status: "pending", score: null, points: [] });
    const after = await lessonRow();
    expect(after).toMatchObject({ id: before.id, revision: 2 });
    // A job for the old revision does nothing.
    expect(await processor.process(job(refOf(before)))).toBe("stale");
    expect(["scored", "stale"]).toContain(await score(after));
    expect(await lessonRow()).toMatchObject({ status: "scored", score: 1 });
  });

  it("aren't scored for real-project answers while the setting is off", async () => {
    const realProject = lessonState.parse(
      (await send("put", REWRITE, { values: { answer: "Sorry for the delay." }, realProject: true })).body,
    );
    expect(realProject.aiScore).toMatchObject({ status: "not_scored", score: null });
    expect(realProject.entry?.realProject).toBe(true);
    expect(await lessonRow()).toMatchObject({ status: "not_scored", revision: 3 });
    // Back to CareBook material with the same text: scored again.
    const again = lessonState.parse(
      (await send("put", REWRITE, { values: { answer: "Sorry for the delay." } })).body,
    );
    expect(again.aiScore?.status).toBe("pending");
    const row = await lessonRow();
    expect(row).toMatchObject({ revision: 4 });
    expect(["scored", "stale"]).toContain(await score(row));
  });

  it("ignore the real-project flag on CareBook-only lessons", async () => {
    const saved = lessonState.parse(
      (await send("put", "/api/me/days/1/lessons/meet", { realProject: true })).body,
    );
    expect(saved.entry?.realProject).toBe(false);
  });

  it("mark the row failed after the last failed attempt", async () => {
    await send("put", REWRITE, { values: { answer: "A third version of the answer." } });
    // A revision no queued job knows about (so a running dev worker can't score it first).
    await fx.owner.query(
      `UPDATE ai_scores SET status = 'pending', revision = revision + 10, score = NULL, points = NULL, reason = NULL,
         better_sentence = NULL, possible_phi = false, model = NULL, prompt_version = NULL, scored_at = NULL
       WHERE user_id = $1 AND target = 'lesson'`,
      [fx.id("eng")],
    );
    const row = await lessonRow();
    const broken: LlmClient = { name: "broken", score: () => Promise.reject(new Error("model down")) };
    const failing = new ScoringProcessor(prisma, broken, logger);
    await expect(failing.process(job(refOf(row), 0))).rejects.toThrow("model down");
    expect(await lessonRow()).toMatchObject({ status: "pending" });
    await expect(failing.process(job(refOf(row), 2))).rejects.toThrow("model down");
    expect(await lessonRow()).toMatchObject({ status: "failed", score: null });
    const day = dayViewResponse.parse((await get("/api/me/days/2")).body);
    expect(day.progress.find((item) => item.id === "rewrite")?.aiScore?.status).toBe("failed");
  });
});

describe("the sweep", () => {
  it("re-queues answers still pending after 10 minutes", async () => {
    await send("put", REWRITE, { values: { answer: GOOD_ANSWER } });
    const row = await lessonRow();
    await fx.owner.query("UPDATE ai_scores SET updated_at = now() - interval '11 minutes' WHERE id = $1", [
      row.id,
    ]);
    const options = { connection: redisConnection(env.REDIS_URL), prefix: `test-${Date.now().toString(36)}` };
    const maintenance = new Queue(QUEUE.maintenance, options);
    const scoring = new Queue(QUEUE.scoring, options);
    try {
      const sweeper = new MaintenanceProcessor(
        prisma,
        new ScoringQueue(scoring, logger),
        logger,
        {} as unknown as RedFlagRunner,
      );
      await sweeper.process({ name: JOB.scoringSweep } as Job);
      const queued = await scoring.getJob(scoreJobId(refOf(row)));
      expect(queued?.data).toEqual(refOf(row));
    } finally {
      await scoring.obliterate({ force: true });
      await maintenance.obliterate({ force: true });
      await scoring.close();
      await maintenance.close();
    }
    expect(["scored", "stale"]).toContain(await score(row));
  });
});

describe("progress and home", () => {
  it("progress shows the writing average of scored write lessons", async () => {
    const progress = progressResponse.parse((await get("/api/me/progress")).body);
    expect(progress.writing).toEqual({ average: 5, count: 1 });
  });

  it("home shows the baseline per pillar and the latest feedback, newest first", async () => {
    const empty = homeResponse.parse((await get("/api/me/home")).body);
    expect(empty.baseline).toBeNull();
    await send("put", "/api/me/days/1/lessons/after-call", {
      values: { "went-well": "Calm.", "fix-next": "Answer first." },
      rubric: { "1": 3, "2": 4, "3": null },
    });
    const ratings = Object.fromEntries(BEHAVIOUR_IDS.map((id) => [id, 3]));
    await send("put", "/api/me/days/1/lessons/baseline", { ratings });

    const home = homeResponse.parse((await get("/api/me/home")).body);
    expect(home.baseline).toEqual({ understand: 3, communicate: 3, own: 3, stand_firm: 3 });
    expect(home.feedback.map((item) => item.kind)).toEqual(["mock", "write", "quiz"]);
    expect(home.feedback[0]).toMatchObject({
      title: "Day 1 · Baseline call",
      detail: "Fix next time: Answer first.",
      value: "3.5",
      href: "/app/day/1/after-call",
    });
    expect(home.feedback[1]).toMatchObject({
      title: "Day 2 · Rewrite",
      value: "5/5",
      href: "/app/day/2/rewrite",
    });
    expect(home.feedback[2]).toMatchObject({
      title: "Day 1 · Daily quiz",
      value: "4/4",
      href: "/app/day/1/quiz",
    });
  });
});
