import { Body, Controller, Get, Injectable, Param, Put } from "@nestjs/common";
import {
  GATE_AFTER_DAY,
  GATE_WEEKS,
  type GateFormResponse,
  gateFormResponse,
  type GateListResponse,
  gateListResponse,
  gateMaths,
  type GateNo,
  type Me,
  managerGateParam,
  meetsBar,
  type SaveGateRequest,
  saveGateRequest,
} from "@portal/contracts";
import { type ManagedEngineer, managedMembers, requireManagedEngineer } from "./engineer.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { DomainError } from "../common/domain-error.js";
import { RequestValidationError, ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { loadReadinessModel, mockCardIds, storedDay } from "../content/lesson.js";
import {
  type FullGateResult,
  GATE_SOURCE,
  type GateProgress,
  loadAllGateResults,
  loadGateProgress,
  loadGateProgresses,
  loadGateResults,
  lockGate,
  toRecap,
} from "../learning/gates.js";
import { loadLearners } from "../learning/learner.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { fullCriteria, overrideNoteRequired, repeatWeeksValid, weekPillars } from "../rules/gates.js";
import { daysOfWeek } from "../rules/rounds.js";
import { DAYS_PER_WEEK } from "../rules/scorecard.js";

/**
 * The manager's gate screens (packages/contracts/src/gates.ts "Manager"). Every query runs as the
 * manager through `withUser`: row-level security limits them to engineers on their teams, and only a
 * manager of the team can record a result (policies on gate_results and the gate rubric_scores rows).
 */
@Injectable()
export class ManagerGateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Each engineer's gates that are reached (Gate 1, then Gate 2), by engineer. */
  list(managerId: string): Promise<GateListResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const members = await managedMembers(tx, managerId);
      // One query per kind of data for the whole team (not per engineer).
      const learners = await loadLearners(
        tx,
        members.map((member) => member.user.id),
      );
      const all = [...learners.values()];
      const progresses = await loadGateProgresses(tx, all);
      const results = await loadAllGateResults(
        tx,
        all.map((learner) => learner.enrollment.id),
      );
      const gates: GateListResponse["gates"] = [];
      for (const member of members) {
        const learner = learners.get(member.user.id);
        if (!learner) continue;
        const enrollmentId = learner.enrollment.id;
        for (const progress of progresses.get(enrollmentId) ?? []) {
          const row = listRow(member.user, progress, results.get(enrollmentId)?.get(progress.gate) ?? []);
          if (row) gates.push(row);
        }
      }
      return asContract(gateListResponse, { gates });
    });
  }

  form(managerId: string, engineerId: string, gate: GateNo): Promise<GateFormResponse> {
    return this.prisma.withUser(managerId, async (tx) =>
      this.buildForm(tx, await requireManagedEngineer(tx, managerId, engineerId), gate),
    );
  }

  /**
   * Record (or edit) the gate round. The maths are recomputed here; an outcome against the pass bar
   * needs an override note. A repeat reopens its 2 weeks as the next round (derived from the result:
   * see rules/rounds.ts); a pass opens the next phase.
   */
  save(
    managerId: string,
    engineerId: string,
    gate: GateNo,
    request: SaveGateRequest,
  ): Promise<GateFormResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const before = await requireManagedEngineer(tx, managerId, engineerId);
      const enrollmentId = before.learner.enrollment.id;
      await lockGate(tx, enrollmentId, gate);
      const engineer = await requireManagedEngineer(tx, managerId, engineerId);
      const progress = await loadGateProgress(tx, engineer.learner, gate);
      const { state } = progress;
      if (state.status === "locked") throw new DomainError("GATE_NOT_REACHED");
      if (await this.nextStepStarted(tx, enrollmentId, gate, progress)) throw new DomainError("CONFLICT");

      const maths = gateMaths(request.criteria);
      if (maths.scored === 0) {
        throw new RequestValidationError(
          { criteria: "Score at least one criterion." },
          "Score at least one criterion.",
        );
      }
      const repeatWeeks = request.outcome === "repeat" ? [...request.repeatWeeks].sort((a, b) => a - b) : [];
      if (request.outcome === "repeat" && !repeatWeeksValid(gate, repeatWeeks)) {
        throw new RequestValidationError(
          { repeatWeeks: "Choose 2 weeks to repeat." },
          "Choose 2 weeks to repeat.",
        );
      }
      const focusItems = request.outcome === "pass_focus" ? request.focusItems : [];
      if (request.outcome === "pass_focus" && focusItems.length === 0) {
        throw new RequestValidationError({ focusItems: "Add 1–2 focus items." }, "Add 1–2 focus items.");
      }
      if (request.cardId && !(await this.phaseCards(tx, gate)).some((card) => card.id === request.cardId)) {
        throw new RequestValidationError({ cardId: `Pick one of the Phase ${gate} cards.` }, "Pick a card.");
      }
      // Gate 2: the Phase 3 live-call plan is needed once Phase 3 opens (a pass); optional with a repeat.
      if (gate === 2 && request.outcome !== "repeat" && request.liveCallPlan === "") {
        throw new RequestValidationError(
          { liveCallPlan: "Write the Phase 3 live-call plan." },
          "Write the Phase 3 live-call plan.",
        );
      }
      const meets = meetsBar(gate, request.criteria, request.recapOnTime, request.healthcareTerms);
      if (overrideNoteRequired(request.outcome, meets) && request.overrideNote === "") {
        throw new DomainError("OVERRIDE_NOTE_REQUIRED");
      }

      const key = { enrollmentId, gate, round: state.round };
      const previous = await tx.gateResult.findUnique({
        where: { enrollmentId_gate_round: key },
        select: { outcome: true, average: true },
      });
      const fields = {
        heldAt: new Date(request.heldAt),
        cardId: request.cardId,
        surprise: request.surprise,
        scored: maths.scored,
        average: maths.average,
        lowest: maths.lowest,
        recapOnTime: request.recapOnTime,
        outcome: request.outcome,
        focusItems,
        repeatWeeks,
        rag: request.rag,
        note: request.note,
        overrideNote: request.overrideNote,
        managerId,
        // Gate 2 only (null for Gate 1).
        healthcareTerms: gate === 2 ? request.healthcareTerms : null,
        liveCallPlan: gate === 2 && request.liveCallPlan !== "" ? request.liveCallPlan : null,
      };
      const saved = await tx.gateResult.upsert({
        where: { enrollmentId_gate_round: key },
        create: { ...key, userId: engineerId, ...fields },
        update: { ...fields, updatedAt: new Date() },
        select: { id: true },
      });
      const day = GATE_AFTER_DAY[gate];
      for (const [criterion, score] of Object.entries(fullCriteria(request.criteria))) {
        const where = {
          enrollmentId,
          source: GATE_SOURCE,
          day,
          criterion: Number(criterion),
          round: state.round,
        };
        await tx.rubricScore.upsert({
          where: { enrollmentId_source_day_criterion_round: where },
          create: { ...where, userId: engineerId, scoredById: managerId, score },
          update: { score, scoredById: managerId },
        });
      }
      // Numbers only: never the notes, focus items or the surprise.
      await audit(tx, "gate.recorded", "gate_result", saved.id, previous, {
        engineer: engineerId,
        gate,
        round: state.round,
        outcome: request.outcome,
        average: maths.average,
        lowest: maths.lowest,
        meetsBar: meets,
        overridden: request.overrideNote !== "",
        repeatWeeks,
        ...(gate === 2 ? { healthcareTerms: request.healthcareTerms } : {}),
      });
      return this.buildForm(tx, await requireManagedEngineer(tx, managerId, engineerId), gate);
    });
  }

  /**
   * A recorded result can be changed until what it led to has started: a repeat until the engineer
   * opens a reopened day in the new round, a pass until the next phase's first day is opened.
   */
  private async nextStepStarted(tx: Tx, enrollmentId: string, gate: GateNo, progress: GateProgress) {
    const { status } = progress.state;
    const latest = progress.latest;
    if (!latest || (status !== "repeat" && status !== "passed" && status !== "passed_focus")) return false;
    const where =
      status === "repeat"
        ? { day: { in: latest.repeatWeeks.flatMap(daysOfWeek) }, round: latest.round + 1 }
        : { day: GATE_AFTER_DAY[gate] + 1 };
    return (await tx.dayProgress.count({ where: { enrollmentId, ...where } })) > 0;
  }

  /** The cards used by the phase's mock lessons (Gate 1: Days 1–20, Gate 2: Days 21–40), by id. */
  private async phaseCards(tx: Tx, gate: GateNo) {
    const last = GATE_AFTER_DAY[gate];
    const days = await tx.contentDay.findMany({
      where: { day: { gte: last - 4 * DAYS_PER_WEEK + 1, lte: last } },
      select: { data: true },
    });
    const ids = [...new Set(days.flatMap((row) => mockCardIds(storedDay.parse(row.data).lessons)))];
    const cards = ids.length
      ? await tx.contentCard.findMany({
          where: { id: { in: ids } },
          orderBy: { id: "asc" },
          select: { data: true },
        })
      : [];
    return cards.flatMap((row) => {
      const data = row.data as { id?: unknown; title?: unknown; client?: unknown };
      return typeof data.id === "string" && typeof data.title === "string" && typeof data.client === "string"
        ? [{ id: data.id, title: data.title, client: data.client }]
        : [];
    });
  }

  /**
   * The gate's weeks with their title, first day and the pillars of their Friday scorecard behaviours.
   * Only weeks with imported days (Gate 2's weeks arrive as their content does).
   */
  private async weeks(tx: Tx, gate: GateNo): Promise<GateFormResponse["weeks"]> {
    const imported = await tx.contentDay.findMany({
      where: { day: { in: GATE_WEEKS[gate].flatMap(daysOfWeek) } },
      select: { day: true },
    });
    const weeks = GATE_WEEKS[gate].filter((week) =>
      imported.some((row) => Math.ceil(row.day / DAYS_PER_WEEK) === week),
    );
    const model = await loadReadinessModel(tx);
    const blocks = await tx.contentBlock.findMany({
      where: { number: { in: [...weeks] } },
      select: { number: true, data: true },
    });
    const fridays = await tx.contentDay.findMany({
      where: { day: { in: weeks.map((week) => week * DAYS_PER_WEEK) } },
      select: { day: true, data: true },
    });
    return weeks.map((week) => {
      const title = (blocks.find((b) => b.number === week)?.data as { title?: unknown } | undefined)?.title;
      const friday = fridays.find((row) => row.day === week * DAYS_PER_WEEK);
      const behaviours = friday
        ? storedDay.parse(friday.data).lessons.flatMap((lesson) => lesson.scorecard)
        : [];
      return {
        week,
        title: typeof title === "string" ? title : "",
        firstDay: (week - 1) * DAYS_PER_WEEK + 1,
        pillars: weekPillars(behaviours, model?.behaviours ?? []),
      };
    });
  }

  private async buildForm(tx: Tx, engineer: ManagedEngineer, gate: GateNo): Promise<GateFormResponse> {
    const progress = await loadGateProgress(tx, engineer.learner, gate);
    const { state } = progress;
    const results = await loadGateResults(tx, engineer.learner.enrollment.id, gate);
    const current = results.find((r) => r.result.round === state.round);
    return asContract(gateFormResponse, {
      engineer: { id: engineer.id, name: engineer.name },
      gate,
      round: state.round,
      status: state.status,
      reached: state.status !== "locked",
      recap: toRecap(progress.recaps.get(state.round)),
      cards: await this.phaseCards(tx, gate),
      weeks: await this.weeks(tx, gate),
      saved: current ? { cardId: current.cardId, surprise: current.surprise, result: current.result } : null,
      history: results
        .filter((r) => r.result.round < state.round)
        .map((r) => r.result)
        .reverse(),
    });
  }
}

/** One engineer's row for a gate: none while the gate is locked. */
function listRow(
  engineer: { id: string; name: string },
  progress: GateProgress,
  results: readonly FullGateResult[],
): GateListResponse["gates"][number] | null {
  const { state } = progress;
  if (state.status === "locked") return null;
  const current = results.find((r) => r.result.round === state.round)?.result ?? null;
  return {
    engineer,
    gate: progress.gate,
    round: state.round,
    status: state.status,
    reachedAt: progress.reachedAt?.toISOString() ?? null,
    recapAt: progress.recaps.get(state.round)?.submittedAt.toISOString() ?? null,
    result: current ? { outcome: current.outcome, average: current.average, heldAt: current.heldAt } : null,
  };
}

@Roles("manager")
@Controller("manager")
export class ManagerGatesController {
  constructor(private readonly gates: ManagerGateService) {}

  @Get("gates")
  list(@CurrentUser() user: Me): Promise<GateListResponse> {
    return this.gates.list(user.id);
  }

  @Get("engineers/:id/gates/:gate")
  form(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(managerGateParam)) params: { id: string; gate: GateNo },
  ): Promise<GateFormResponse> {
    return this.gates.form(user.id, params.id, params.gate);
  }

  /** Returns the gate form as saved. */
  @Put("engineers/:id/gates/:gate")
  save(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(managerGateParam)) params: { id: string; gate: GateNo },
    @Body(new ZodValidationPipe(saveGateRequest)) body: SaveGateRequest,
  ): Promise<GateFormResponse> {
    return this.gates.save(user.id, params.id, params.gate, body);
  }
}
