import { Body, Controller, Get, HttpCode, Param, Patch, Query } from "@nestjs/common";
import {
  idParam,
  type ListUsersResponse,
  type Me,
  pageQuery,
  type UpdateUserAccessRequest,
  updateUserAccessRequest,
} from "@portal/contracts";
import { UsersService } from "./users.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

@Roles("admin")
@Controller("admin/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @CurrentUser() admin: Me,
    @Query(new ZodValidationPipe(pageQuery)) query: { page: number },
  ): Promise<ListUsersResponse> {
    return this.users.list(admin.id, query.page);
  }

  @Patch(":id")
  @HttpCode(204)
  async updateAccess(
    @CurrentUser() admin: Me,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(updateUserAccessRequest)) body: UpdateUserAccessRequest,
  ): Promise<void> {
    await this.users.updateAccess(admin.id, params.id, body);
  }
}
