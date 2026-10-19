import { createAnthropic } from "@ai-sdk/anthropic";
import { scoreResult } from "@portal/contracts";
import { generateText, Output } from "ai";
import { type LlmClient, type ScoredAnswer, type ScoreInput } from "./llm-client.js";
import { SCORE_SYSTEM_PROMPT, scoreUserPrompt } from "./prompt.js";

/** A scoring call that takes longer than this fails (and BullMQ retries it). */
const TIMEOUT_MS = 60_000;

/**
 * Scoring through Anthropic's API with the Vercel AI SDK (docs/PORTAL_PLAN.md §7.1). Structured output is
 * validated against `scoreResult` by the SDK; the server's consistency check runs after. The SDK's own
 * retries are off: BullMQ owns retries. Haiku 5.5 takes no `temperature`, so none is sent; `effort: low`
 * keeps it from thinking at length about a short, rubric-bound task.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly name = "anthropic";
  private readonly provider;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.provider = createAnthropic({ apiKey });
  }

  async score(input: ScoreInput): Promise<ScoredAnswer> {
    const result = await generateText({
      model: this.provider(this.model),
      instructions: SCORE_SYSTEM_PROMPT,
      prompt: scoreUserPrompt(input),
      output: Output.object({ schema: scoreResult, name: "score" }),
      providerOptions: { anthropic: { effort: "low", structuredOutputMode: "outputFormat" } },
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { result: result.output, model: result.response.modelId || this.model };
  }
}
