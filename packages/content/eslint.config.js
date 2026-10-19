import { node, typescript } from "@portal/config/eslint";

export default [
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  ...node(),
  // The content:check command line prints its report.
  { files: ["src/cli.ts"], rules: { "no-console": "off" } },
];
