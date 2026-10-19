import { Module } from "@nestjs/common";
import { AnthropicLlmClient } from "./anthropic-llm-client.js";
import { FakeLlmClient } from "./fake-llm-client.js";
import { LLM_CLIENT, type LlmClient } from "./llm-client.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";

export type LlmMode = "anthropic" | "fake" | "off";

/**
 * Which scorer the worker uses: Anthropic when a key is set; the fake outside production without a key;
 * none in production without a key (answers stay pending, never fake scores). Also shown on the admin
 * Settings screen.
 */
export function llmMode(env: Pick<Env, "NODE_ENV" | "ANTHROPIC_API_KEY">): LlmMode {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return env.NODE_ENV === "production" ? "off" : "fake";
}

export function createLlmClient(
  env: Pick<Env, "NODE_ENV" | "ANTHROPIC_API_KEY" | "LLM_SCORING_MODEL">,
): LlmClient | null {
  switch (llmMode(env)) {
    case "anthropic":
      return new AnthropicLlmClient(env.ANTHROPIC_API_KEY, env.LLM_SCORING_MODEL);
    case "fake":
      return new FakeLlmClient();
    case "off":
      return null;
  }
}

@Module({
  providers: [{ provide: LLM_CLIENT, inject: [ENV], useFactory: createLlmClient }],
  exports: [LLM_CLIENT],
})
export class LlmModule {}
