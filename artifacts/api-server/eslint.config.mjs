// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Prevent Temporal Dead Zone (TDZ) bugs: using a const/let before its declaration.
      // This is the class of bug that caused "Cannot access before initialization" errors
      // in route handlers when variables were referenced before their const/let line.
      "no-use-before-define": "off", // turn off base rule (TS version handles it)
      "@typescript-eslint/no-use-before-define": [
        "error",
        {
          functions: false,   // hoisted function declarations are safe
          classes: true,
          variables: true,    // ← catches the TDZ pattern we care about
          allowNamedExports: false,
        },
      ],
    },
  },
];
