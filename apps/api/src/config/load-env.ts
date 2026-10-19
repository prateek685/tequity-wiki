// Side-effect import: entry points import this FIRST so the .env file is loaded before any module
// (e.g. AuthModule.register) reads process.env while being evaluated.
import { loadLocalEnv } from "./env-file.js";

loadLocalEnv();
