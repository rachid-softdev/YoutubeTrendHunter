import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Forbid any `eslint-disable` directive comment project-wide.
// Project type-safety rules require fixing the root cause, never silencing the linter.
const noEslintDisable = {
  meta: {
    type: "problem",
    docs: { description: "Disallow eslint-disable comments" },
    messages: {
      banned: "eslint-disable comments are forbidden. Fix the underlying type issue instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.getAllComments();
        for (const comment of comments) {
          if (/^\s*eslint-disable(-next-line|-line)?(\s|$)/.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: "banned" });
          }
        }
      },
    };
  },
};

const noTsComment = {
  meta: {
    type: "problem",
    docs: { description: "Disallow @ts-ignore/@ts-nocheck/@ts-expect-error comments" },
    messages: {
      banned:
        "Type-suppression comments (@ts-ignore/@ts-nocheck/@ts-expect-error) are forbidden. Fix the type at the source.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.getAllComments();
        for (const comment of comments) {
          if (/^\s*@ts-(ignore|nocheck|expect-error)\b/.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: "banned" });
          }
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "strict-comments": {
        rules: { "no-eslint-disable": noEslintDisable, "no-ts-comment": noTsComment },
      },
    },
    rules: {
      // Forbid `any` everywhere, including tests (project type-safety rules).
      "@typescript-eslint/no-explicit-any": "error",
      // Forbid ts-ignore / ts-nocheck / ts-expect-error entirely (fix the type at source).
      "strict-comments/no-ts-comment": "error",
      // Forbid silencing the linter via eslint-disable comments.
      "strict-comments/no-eslint-disable": "error",
      // Allow intentionally-unused identifiers prefixed with `_`
      // (e.g. Next.js route handler args like `_req`, test stubs).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "scripts/**", "worktrees/**"]),
]);

export default eslintConfig;
