import { Module } from "@nestjs/common";
import { AssessmentService } from "./assessments.js";
import { CheckinPrepService } from "./checkin-prep.js";
import { FinalReviewService } from "./final-review.js";
import { GateService } from "./gates.js";
import { LearningController } from "./learning.controller.js";
import { LearningService } from "./learning.service.js";
import { ProgressService } from "./progress.service.js";
import { JobsModule } from "../jobs/jobs.module.js";

@Module({
  imports: [JobsModule],
  controllers: [LearningController],
  providers: [
    LearningService,
    AssessmentService,
    ProgressService,
    GateService,
    FinalReviewService,
    CheckinPrepService,
  ],
})
export class LearningModule {}
