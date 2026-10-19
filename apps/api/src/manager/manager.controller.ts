import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  checkinParam,
  type CheckinFormResponse,
  type EngineerDetailResponse,
  idParam,
  type Me,
  type SaveCheckinRequest,
  saveCheckinRequest,
  type TeamResponse,
  type UnlockRequest,
  unlockRequest,
} from "@portal/contracts";
import { ManagerService } from "./manager.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

@Roles("manager")
@Controller("manager")
export class ManagerController {
  constructor(private readonly manager: ManagerService) {}

  @Get("team")
  team(@CurrentUser() user: Me): Promise<TeamResponse> {
    return this.manager.team(user.id);
  }

  @Get("engineers/:id")
  engineer(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ): Promise<EngineerDetailResponse> {
    return this.manager.engineer(user.id, params.id);
  }

  /** Returns the engineer detail after the unlock. */
  @Post("engineers/:id/unlock")
  @HttpCode(200)
  unlock(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(unlockRequest)) body: UnlockRequest,
  ): Promise<EngineerDetailResponse> {
    return this.manager.unlock(user.id, params.id, body);
  }

  @Get("engineers/:id/checkins/:day")
  checkin(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(checkinParam)) params: { id: string; day: number },
  ): Promise<CheckinFormResponse> {
    return this.manager.checkinForm(user.id, params.id, params.day);
  }

  /** Returns the check-in form as saved. */
  @Put("engineers/:id/checkins/:day")
  saveCheckin(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(checkinParam)) params: { id: string; day: number },
    @Body(new ZodValidationPipe(saveCheckinRequest)) body: SaveCheckinRequest,
  ): Promise<CheckinFormResponse> {
    return this.manager.saveCheckin(user.id, params.id, params.day, body);
  }
}
