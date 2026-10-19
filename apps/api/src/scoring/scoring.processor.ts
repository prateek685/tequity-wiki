import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnApplicationBootstrap } from "@nestjs/common";
import { type Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { loadScoreInput } from "./score-input.js";
import { SCORING_LIMITER, scoreRef, type ScoreRef } from "./scoring.js";
import { QUEUE } from "../jobs/queues.js";
import { checkScore } from "../llm/consistency.js";
import { LLM_CLIENT, type LlmClient } from "../llm/llm-client.js";
import { PROMPT_VERSION } from "../llm/prompt.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type ScoreOutcome = "scored" | "stale" | "failed";

/**
 * Scores one answer per job (queue `scoring`, at most 15 jobs a minute). Reads the answer as its owner,
 * asks the scorer, checks the result against the guide, and stores it through app.ai_score_record().
 * An error or an inconsistent result fails the attempt (BullMQ retries with backoff); after the last
 * attempt the row is marked `failed`. Never logs answer text.
 *
 * Without a scorer (production without ANTHROPIC_API_KEY) the worker doesn't take scoring jobs at
 * all: they wait in the queue and answers stay `pending` until a key is set.
 */
@Processor(QUEUE.scoring, { autorun: false, limiter: SCORING_LIMITER })
export class ScoringProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_CLIENT) private readonly llm: LlmClient | null,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(ScoringProcessor.name);
  }

  onApplicationBootstrap(): void {
    if (!this.llm) {
      this.logger.warn("AI scoring is off: no ANTHROPIC_API_KEY. Answers stay pending.");
      return;
    }
    this.logger.info({ scorer: this.llm.name }, "AI scoring on");
    this.worker.run().catch((error: unknown) => {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "scoring worker stopped",
      );
    });
  }

  async process(job: Job): Promise<ScoreOutcome> {
    if (!this.llm) throw new Error("No AI scorer configured");
    const ref = scoreRef.parse(job.data);
    const attempt = job.attemptsMade + 1;
    const input = await this.prisma.withUser(ref.userId, (tx) => loadScoreInput(tx, ref));
    if (input === "stale") return "stale";
    if (input === "unscorable") {
      await this.fail(ref, attempt);
      this.logger.warn({ aiScoreId: ref.aiScoreId }, "answer or scoring guide missing; marked failed");
      return "failed";
    }
    try {
      const scored = await this.llm.score(input);
      const result = checkScore(scored.result, input.scoringPoints);
      const rows = await this.prisma.system.$queryRaw<{ saved: boolean }[]>`
        SELECT app.ai_score_record(
          ${ref.aiScoreId}::uuid, ${ref.revision}::int, ${result.score}::int,
          ${JSON.stringify(result.points)}::jsonb, ${result.reason}, ${result.betterSentence},
          ${result.possiblePhi}, ${scored.model}, ${PROMPT_VERSION}, ${attempt}::int) AS saved`;
      const saved = rows[0]?.saved === true;
      this.logger.info({ aiScoreId: ref.aiScoreId, attempt, model: scored.model, saved }, "answer scored");
      return saved ? "scored" : "stale";
    } catch (error) {
      const last = attempt >= (job.opts.attempts ?? 1);
      if (last) await this.fail(ref, attempt);
      this.logger.warn(
        {
          aiScoreId: ref.aiScoreId,
          attempt,
          last,
          error: error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : "unknown",
        },
        "scoring attempt failed",
      );
      throw error;
    }
  }

  private async fail(ref: ScoreRef, attempt: number): Promise<void> {
    await this.prisma.system.$queryRaw`
      SELECT app.ai_score_fail(${ref.aiScoreId}::uuid, ${ref.revision}::int, ${attempt}::int)`;
  }
}
