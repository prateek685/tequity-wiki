import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type CreateTeamRequest,
  createTeamRequest,
  idParam,
  type ListTeamsResponse,
  type Me,
  pageQuery,
  type TeamManagerRequest,
  teamManagerRequest,
} from "@portal/contracts";
import { z } from "zod";
import { TeamsService } from "./teams.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

const managerParams = z.object({ id: z.uuid(), userId: z.uuid() });

@Roles("admin")
@Controller("admin/teams")
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(
    @CurrentUser() admin: Me,
    @Query(new ZodValidationPipe(pageQuery)) query: { page: number },
  ): Promise<ListTeamsResponse> {
    return this.teams.list(admin.id, query.page);
  }

  @Post()
  @HttpCode(204)
  async create(
    @CurrentUser() admin: Me,
    @Body(new ZodValidationPipe(createTeamRequest)) body: CreateTeamRequest,
  ): Promise<void> {
    await this.teams.create(admin.id, body.name);
  }

  @Post(":id/managers")
  @HttpCode(204)
  async addManager(
    @CurrentUser() admin: Me,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(teamManagerRequest)) body: TeamManagerRequest,
  ): Promise<void> {
    await this.teams.addManager(admin.id, params.id, body.userId);
  }

  @Delete(":id/managers/:userId")
  @HttpCode(204)
  async removeManager(
    @CurrentUser() admin: Me,
    @Param(new ZodValidationPipe(managerParams)) params: z.infer<typeof managerParams>,
  ): Promise<void> {
    await this.teams.removeManager(admin.id, params.id, params.userId);
  }
}
