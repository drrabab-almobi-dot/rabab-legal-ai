// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["node_modules/**", "scripts/**", "server/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      // React hooks rules — needed so eslint-disable comments for exhaustive-deps are valid
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
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
