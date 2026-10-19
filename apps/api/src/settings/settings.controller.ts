import { Body, Controller, Get, Put } from "@nestjs/common";
import {
  type Me,
  type SettingsResponse,
  type UpdateSettingsRequest,
  updateSettingsRequest,
} from "@portal/contracts";
import { SettingsService } from "./settings.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

@Roles("admin")
@Controller("admin/settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() admin: Me): Promise<SettingsResponse> {
    return this.settings.get(admin.id);
  }

  /** Only the keys sent change (audited); returns the settings as saved. */
  @Put()
  update(
    @CurrentUser() admin: Me,
    @Body(new ZodValidationPipe(updateSettingsRequest)) body: UpdateSettingsRequest,
  ): Promise<SettingsResponse> {
    return this.settings.update(admin.id, body);
  }
}
