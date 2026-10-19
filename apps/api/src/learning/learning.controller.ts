import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  type AnswerQuizItemRequest,
  answerQuizItemRequest,
  type AnswerQuizItemResponse,
  assessmentParam,
  type AssessmentViewResponse,
  checkinPrepParam,
  type CheckinPrepResponse,
  type CourseOutlineResponse,
  dayParam,
  type DayViewResponse,
  type FinalReviewViewResponse,
  gateParam,
  type GateNo,
  type GateViewResponse,
  type HomeResponse,
  type JournalResponse,
  type Me,
  type MyPlanResponse,
  type ProgressResponse,
  type PromptCopyResponse,
  quizItemParam,
  type QuizViewResponse,
  lessonParam,
  type LessonState,
  type SaveCheckinPrepRequest,
  saveCheckinPrepRequest,
  type SaveGateRecapRequest,
  saveGateRecapRequest,
  type SaveLessonRequest,
  saveLessonRequest,
} from "@portal/contracts";
import { AssessmentService } from "./assessments.js";
import { CheckinPrepService } from "./checkin-prep.js";
import { FinalReviewService } from "./final-review.js";
import { GateService } from "./gates.js";
import { LearningService } from "./learning.service.js";
import { ProgressService } from "./progress.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

@Roles("engineer")
@Controller("me")
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly assessments: AssessmentService,
    private readonly progressPages: ProgressService,
    private readonly gates: GateService,
    private readonly finalReviews: FinalReviewService,
    private readonly checkinPreps: CheckinPrepService,
  ) {}

  /** The engineer's notes for a check-in: spot-check, where they are stuck, support needed. */
  @Get("checkins/:day")
  checkinPrep(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(checkinPrepParam)) params: { day: number },
  ): Promise<CheckinPrepResponse> {
    return this.checkinPreps.view(user.id, params.day);
  }

  /** Saves the notes while the manager has not recorded that check-in. */
  @Put("checkins/:day")
  saveCheckinPrep(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(checkinPrepParam)) params: { day: number },
    @Body(new ZodValidationPipe(saveCheckinPrepRequest)) body: SaveCheckinPrepRequest,
  ): Promise<CheckinPrepResponse> {
    return this.checkinPreps.save(user.id, params.day, body);
  }

  /** The final review after Day 64: status, live-call days still "later", and the result once recorded. */
  @Get("final-review")
  finalReview(@CurrentUser() user: Me): Promise<FinalReviewViewResponse> {
    return this.finalReviews.view(user.id);
  }

  /** Home cards not covered by /me/plan and /me/days/:day: the Day-1 baseline and the latest feedback. */
  @Get("home")
  home(@CurrentUser() user: Me): Promise<HomeResponse> {
    return this.progressPages.home(user.id);
  }

  @Get("progress")
  progress(@CurrentUser() user: Me): Promise<ProgressResponse> {
    return this.progressPages.progress(user.id);
  }

  /** Private to the engineer: everything they wrote in their lessons. */
  @Get("journal")
  journal(@CurrentUser() user: Me): Promise<JournalResponse> {
    return this.progressPages.journal(user.id);
  }

  @Get("plan")
  plan(@CurrentUser() user: Me): Promise<MyPlanResponse> {
    return this.learning.plan(user.id);
  }

  @Get("course")
  course(@CurrentUser() user: Me): Promise<CourseOutlineResponse> {
    return this.learning.course(user.id);
  }

  @Get("days/:day")
  day(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(dayParam)) params: { day: number },
  ): Promise<DayViewResponse> {
    return this.learning.day(user.id, params.day);
  }

  @Put("days/:day/lessons/:lesson")
  saveLesson(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(lessonParam)) params: { day: number; lesson: string },
    @Body(new ZodValidationPipe(saveLessonRequest)) body: SaveLessonRequest,
  ): Promise<LessonState> {
    return this.learning.saveLesson(user.id, params.day, params.lesson, body);
  }

  @Post("days/:day/lessons/:lesson/prompt-copy")
  @HttpCode(200)
  promptCopy(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(lessonParam)) params: { day: number; lesson: string },
  ): Promise<PromptCopyResponse> {
    return this.learning.promptCopy(user.id, params.day, params.lesson);
  }

  @Post("days/:day/quiz")
  @HttpCode(200)
  startQuiz(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(dayParam)) params: { day: number },
  ): Promise<QuizViewResponse> {
    return this.learning.startQuiz(user.id, params.day);
  }

  @Get("assessments/:day")
  assessment(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(assessmentParam)) params: { day: number },
  ): Promise<AssessmentViewResponse> {
    return this.assessments.view(user.id, params.day);
  }

  @Post("assessments/:day/start")
  @HttpCode(200)
  startAssessment(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(assessmentParam)) params: { day: number },
  ): Promise<AssessmentViewResponse> {
    return this.assessments.start(user.id, params.day);
  }

  @Post("quiz/:attemptId/items/:position")
  @HttpCode(200)
  answer(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(quizItemParam)) params: { attemptId: string; position: number },
    @Body(new ZodValidationPipe(answerQuizItemRequest)) body: AnswerQuizItemRequest,
  ): Promise<AnswerQuizItemResponse> {
    return this.learning.answer(user.id, params.attemptId, params.position, body);
  }

  @Get("gates/:gate")
  gate(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(gateParam)) params: { gate: GateNo },
  ): Promise<GateViewResponse> {
    return this.gates.view(user.id, params.gate);
  }

  /** Write or edit the recap until the manager records the round; returns the Gate page. */
  @Put("gates/:gate/recap")
  saveGateRecap(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(gateParam)) params: { gate: GateNo },
    @Body(new ZodValidationPipe(saveGateRecapRequest)) body: SaveGateRecapRequest,
  ): Promise<GateViewResponse> {
    return this.gates.saveRecap(user.id, params.gate, body);
  }
}
