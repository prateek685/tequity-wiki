import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { toApiError } from "./api-error.js";
import type { Request, Response } from "express";

/** Every error leaves the API as `{ code, message, fields? }` (see ApiErrorBody in @portal/contracts). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ApiExceptionFilter.name);
  }

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const mapped = toApiError(error);
    if (mapped.unexpected) {
      this.logger.error({ err: error, method: request.method, path: request.path }, "unexpected error");
    }
    response.status(mapped.status).json(mapped.body);
  }
}
