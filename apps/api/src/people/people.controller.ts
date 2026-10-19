import { Controller, Get, Query } from "@nestjs/common";
import { type ListMyEngineersResponse, type Me, type MyEnrollment, pageQuery } from "@portal/contracts";
import { PeopleService } from "./people.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Roles("engineer")
  @Get("me/enrollment")
  myEnrollment(@CurrentUser() user: Me): Promise<MyEnrollment> {
    return this.people.myEnrollment(user.id);
  }

  @Roles("manager")
  @Get("manager/engineers")
  myEngineers(
    @CurrentUser() user: Me,
    @Query(new ZodValidationPipe(pageQuery)) query: { page: number },
  ): Promise<ListMyEngineersResponse> {
    return this.people.myEngineers(user.id, query.page);
  }
}
