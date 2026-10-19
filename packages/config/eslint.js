// Shared ESLint flat config (docs/PORTAL_PLAN.md §8a coding standards, §8b UI design system).
// Each workspace builds its config from `typescript()` and, for the React app, `react()`.
import eslintReact from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Type-checked TypeScript rules for every workspace. Errors only for rules that catch real bugs;
 * style rules are auto-fixable warnings (they never block CI).
 * @param {{ tsconfigRootDir: string, internalPatterns?: string[] }} options
 */
export function typescript({ tsconfigRootDir, internalPatterns = [] }) {
  return defineConfig(
    js.configs.recommended,
    {
      files: ["**/*.{ts,tsx}"],
      extends: [tseslint.configs.recommendedTypeChecked],
      plugins: { "import-x": importX },
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/ban-ts-comment": [
          "error",
          { "ts-ignore": true, "ts-expect-error": "allow-with-description" },
        ],
        "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "no-console": ["warn", { allow: ["warn", "error"] }],
        eqeqeq: ["error", "always"],
        "import-x/order": [
          "warn",
          {
            groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "type"],
            pathGroups: internalPatterns.map((pattern) => ({ pattern, group: "internal" })),
            alphabetize: { order: "asc", caseInsensitive: true },
          },
        ],
      },
    },
    {
      // Scripts and tests may log to the console.
      files: ["scripts/**", "test/**", "e2e/**", "**/*.test.ts", "**/*.test.tsx"],
      rules: { "no-console": "off" },
    },
    { ignores: ["dist/**", "coverage/**", "generated/**"] },
  );
}

// Design-system rule: styling comes only from tokens and shared components. No inline style props
// and no arbitrary Tailwind values such as `w-[13px]`, `bg-[#fff]` or Tailwind v4 `w-(--size)`.
const ARBITRARY_TAILWIND = String.raw`(^|\s)[\w:-]*-(\[[^\]]+\]|\(--[\w-]+\))`;
const ARBITRARY_MESSAGE =
  "Arbitrary Tailwind values are not allowed. Use a design token (globals.css @theme) or a component class.";
const CLASS_CALLS = "CallExpression[callee.name=/^(cn|cva|clsx)$/]";

/**
 * React rules for the web app: React + hooks correctness (@eslint-react), static accessibility checks
 * (jsx-a11y-x, recommended), no inline styles and no arbitrary Tailwind values. Runtime accessibility is
 * checked again by axe in the Playwright tests.
 */
export function react() {
  return defineConfig({
    files: ["**/*.tsx"],
    extends: [eslintReact.configs["recommended-type-checked"], jsxA11y.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='style']",
          message: "Inline styles are not allowed. Use tokens and components.",
        },
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=/${ARBITRARY_TAILWIND}/]`,
          message: ARBITRARY_MESSAGE,
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${ARBITRARY_TAILWIND}/]`,
          message: ARBITRARY_MESSAGE,
        },
        { selector: `${CLASS_CALLS} Literal[value=/${ARBITRARY_TAILWIND}/]`, message: ARBITRARY_MESSAGE },
        {
          selector: `${CLASS_CALLS} TemplateElement[value.raw=/${ARBITRARY_TAILWIND}/]`,
          message: ARBITRARY_MESSAGE,
        },
      ],
    },
  });
}

/** Node globals for the API, worker and scripts. */
export function node() {
  return defineConfig({ languageOptions: { globals: globals.node } });
}
