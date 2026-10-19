import "./config/load-env.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureHttp } from "./http.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
const env = configureHttp(app);
await app.listen(env.PORT);
