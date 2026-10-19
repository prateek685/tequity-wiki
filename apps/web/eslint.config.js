import { node, react, typescript } from "@portal/config/eslint";

export default [
  ...typescript({ tsconfigRootDir: import.meta.dirname, internalPatterns: ["@/**"] }),
  ...react(),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // TanStack Router navigates by throwing redirect() from beforeLoad / loaders.
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "package", package: "@tanstack/router-core", name: "Redirect" }] },
      ],
    },
  },
  {
    // `role` is a prop on our own components (e.g. AppShell), not an ARIA role.
    files: ["src/**/*.tsx"],
    rules: { "jsx-a11y-x/aria-role": ["error", { ignoreNonDOM: true }] },
  },
  {
    // Build and test configuration run in Node.
    files: ["*.config.ts", "e2e/**"],
    ...node()[0],
  },
  { ignores: ["dist/**", "src/routeTree.gen.ts", "playwright-report/**", "test-results/**"] },
];
