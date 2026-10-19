import { node, typescript } from "@portal/config/eslint";

export default [
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  ...node(),
  {
    // Nest resolves constructor dependencies from their runtime class, so these imports must stay
    // value imports even when only used as a type annotation.
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],
      // Nest modules, controllers and services are classes with decorators but no own members.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },
  { ignores: ["src/generated/**"] },
];
