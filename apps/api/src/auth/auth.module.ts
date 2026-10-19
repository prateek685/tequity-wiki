import { type DynamicModule, Module } from "@nestjs/common";
import { AdminLoginController } from "./admin-login.controller.js";
import { AdminPasswordController } from "./admin-password.controller.js";
import { AuthController } from "./auth.controller.js";
import { DevLoginController } from "./dev-login.controller.js";
import { GoogleService } from "./google.service.js";
import { LoginService } from "./login.service.js";
import { SessionsService } from "./sessions.service.js";
import { devLoginAllowed, parseEnv } from "../config/env.js";

@Module({})
export class AuthModule {
  /** The dev-login route is only registered outside production (decided once, at start-up). */
  static register(): DynamicModule {
    const controllers = devLoginAllowed(parseEnv(process.env))
      ? [AuthController, AdminLoginController, AdminPasswordController, DevLoginController]
      : [AuthController, AdminLoginController, AdminPasswordController];
    return {
      module: AuthModule,
      controllers,
      providers: [GoogleService, LoginService, SessionsService],
      exports: [SessionsService],
    };
  }
}
