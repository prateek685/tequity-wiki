import "./config/load-env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { ENV } from "./config/config.module.js";
import { type Env } from "./config/env.js";
import { WorkerModule } from "./worker.module.js";

const app = await NestFactory.create(WorkerModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.enableShutdownHooks();
await app.listen(app.get<Env>(ENV).WORKER_HEALTH_PORT);
