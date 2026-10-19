import type { Linter } from "eslint";

export function typescript(options: {
  tsconfigRootDir: string;
  internalPatterns?: string[];
}): Linter.Config[];
export function react(): Linter.Config[];
export function node(): Linter.Config[];
