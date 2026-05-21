import js from "@eslint/js";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Global ignores — must be first and must have ONLY the `ignores` key (ESLint v9 flat config)
  {
    ignores: [
      "node_modules/**",
      ".claude/**",       // git worktrees — checked-out copies, not part of this package
      "coverage/**",      // test coverage output
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      // Catch real bugs
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-constant-condition": "warn",
      "no-unreachable": "error",

      // Async safety
      "no-async-promise-executor": "error",
      "require-await": "warn",

      // Code quality
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": ["warn", { destructuring: "all" }],
      "no-duplicate-imports": "error",

      // Not enforced (allow flexibility during migration)
      "consistent-return": "off"
    },
    ignores: ["node_modules/**", "test/**"]
  },
  // Relax rules in test files
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": "off",
      "require-await": "off"
    }
  }
];
