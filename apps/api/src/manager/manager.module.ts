import { Module } from "@nestjs/common";
import { ManagerFinalReviewController, ManagerFinalReviewService } from "./final-review.js";
import { ManagerGatesController, ManagerGateService } from "./gates.js";
import { ManagerController } from "./manager.controller.js";
import { ManagerService } from "./manager.service.js";
import { ManagerRedFlagsController, ManagerRedFlagService } from "./red-flags.js";

@Module({
  controllers: [
    ManagerController,
    ManagerGatesController,
    ManagerRedFlagsController,
    ManagerFinalReviewController,
  ],
  providers: [ManagerService, ManagerGateService, ManagerRedFlagService, ManagerFinalReviewService],
})
export class ManagerModule {}
