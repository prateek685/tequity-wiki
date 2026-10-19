import { Inject, Injectable } from "@nestjs/common";
import {
  SETTING_KEYS,
  type SettingKey,
  type SettingsResponse,
  settingsResponse,
  type UpdateSettingsRequest,
} from "@portal/contracts";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { RequestValidationError } from "../common/zod-validation.pipe.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { PACE_DEFAULTS } from "../learning/learner.js";
import { llmMode } from "../llm/llm.module.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { ASSESSMENT_DEFAULTS } from "../rules/assessment.js";
import { type SettingValue, settingsProblems, settingValue } from "../rules/settings.js";

/** What the API uses when a setting row is missing (the same defaults the readers apply). */
const DEFAULTS: Record<SettingKey, SettingValue> = {
  "assessment.passPercent": ASSESSMENT_DEFAULTS.passPercent,
  "assessment.retakeHours": ASSESSMENT_DEFAULTS.retakeHours,
  "pace.behindToleranceDays": PACE_DEFAULTS["pace.behindToleranceDays"],
  "learning.unlockAll": false,
  "ai.scoreRealProjectAnswers": false,
};

/**
 * Admin Settings (packages/contracts/src/admin.ts "Settings"). Runs as the admin through `withUser`:
 * only admins can write settings (row-level security), and the AI score counts come from the
 * admin-only `app.ai_score_counts()`. The AI mode is the worker's own choice (`llmMode`).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get(adminId: string): Promise<SettingsResponse> {
    return this.prisma.withUser(adminId, (tx) => this.view(tx));
  }

  update(adminId: string, request: UpdateSettingsRequest): Promise<SettingsResponse> {
    const problems = settingsProblems(request.values);
    const first = Object.values(problems)[0];
    if (first) throw new RequestValidationError(problems, first);
    return this.prisma.withUser(adminId, async (tx) => {
      const current = await this.values(tx);
      for (const [key, value] of Object.entries(request.values) as [SettingKey, SettingValue][]) {
        if (current[key] === value) continue;
        await tx.setting.upsert({
          where: { key },
          create: { key, value, updatedBy: adminId },
          update: { value, updatedBy: adminId, updatedAt: new Date() },
        });
        await audit(tx, "setting.changed", "setting", key, { value: current[key] }, { value });
      }
      return this.view(tx);
    });
  }

  private async values(tx: Tx): Promise<Record<SettingKey, SettingValue>> {
    const rows = await tx.setting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
      select: { key: true, value: true },
    });
    return Object.fromEntries(
      SETTING_KEYS.map((key) => [
        key,
        settingValue(key, rows.find((row) => row.key === key)?.value, DEFAULTS[key]),
      ]),
    ) as Record<SettingKey, SettingValue>;
  }

  private async view(tx: Tx): Promise<SettingsResponse> {
    const counts = await tx.$queryRaw<{ pending: number; failed: number }[]>`
      SELECT pending, failed FROM app.ai_score_counts()`;
    return asContract(settingsResponse, {
      values: await this.values(tx),
      ai: {
        mode: llmMode(this.env),
        model: this.env.LLM_SCORING_MODEL,
        pending: counts[0]?.pending ?? 0,
        failed: counts[0]?.failed ?? 0,
      },
    });
  }
}
