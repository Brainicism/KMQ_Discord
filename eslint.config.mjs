// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importXPlugin from "eslint-plugin-import-x";
import jsdocPlugin from "eslint-plugin-jsdoc";
import nPlugin from "eslint-plugin-n";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import stylistic from "@stylistic/eslint-plugin";
import tsdocPlugin from "eslint-plugin-tsdoc";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

// Side-effect import: patches Linter.prototype.verify to downgrade all errors to warnings
import "eslint-plugin-only-warn";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
    // Global ignores (replaces .eslintignore)
    {
        ignores: ["node_modules/", "build/", "migrations/", "src/config/"],
    },

    // Base JS recommended rules
    js.configs.recommended,

    // TypeScript recommended rules (non-type-checked base)
    ...tseslint.configs.recommended,

    // Prettier must come after other configs to override formatting rules
    prettierConfig,

    // Main project config for TS/JS files
    {
        files: ["src/**/*.ts", "src/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },
        plugins: {
            "import-x": importXPlugin,
            jsdoc: jsdocPlugin,
            n: nPlugin,
            "simple-import-sort": simpleImportSort,
            "@stylistic": stylistic,
            tsdoc: tsdocPlugin,
        },
        rules: {
            // === TypeScript rules ===
            "@typescript-eslint/no-floating-promises": ["warn"],
            "@typescript-eslint/no-misused-promises": [
                "warn",
                {
                    checksVoidReturn: {
                        arguments: false,
                    },
                },
            ],
            "@typescript-eslint/await-thenable": ["warn"],
            "@typescript-eslint/no-unnecessary-condition": ["warn"],
            "@typescript-eslint/require-await": ["warn"],
            "@typescript-eslint/explicit-function-return-type": [
                "warn",
                {
                    allowExpressions: true,
                },
            ],
            "@typescript-eslint/consistent-type-imports": ["warn"],
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/member-ordering": [
                "warn",
                {
                    default: [
                        "public-field",
                        "protected-field",
                        "private-field",
                        "public-method",
                        "protected-method",
                        "private-method",
                    ],
                },
            ],
            "@typescript-eslint/dot-notation": ["off"],
            // Replaces eslint-plugin-deprecation
            "@typescript-eslint/no-deprecated": ["warn"],

            // === Stylistic rules (moved from eslint core / typescript-eslint) ===
            "@stylistic/quotes": ["warn", "double"],
            "@stylistic/type-annotation-spacing": ["warn"],
            "@stylistic/lines-between-class-members": [
                "warn",
                "always",
                { exceptAfterSingleLine: true },
            ],
            "@stylistic/max-len": [
                "warn",
                {
                    ignoreStrings: true,
                    ignoreTemplateLiterals: true,
                    code: 200,
                },
            ],
            "@stylistic/padding-line-between-statements": [
                "warn",
                {
                    blankLine: "always",
                    prev: "block-like",
                    next: "*",
                },
                {
                    blankLine: "always",
                    prev: "multiline-expression",
                    next: "multiline-expression",
                },
                {
                    blankLine: "always",
                    prev: "multiline-let",
                    next: "*",
                },
                {
                    blankLine: "always",
                    prev: "multiline-const",
                    next: "*",
                },
                {
                    blankLine: "always",
                    prev: "multiline-block-like",
                    next: "*",
                },
                {
                    blankLine: "always",
                    prev: "*",
                    next: "function",
                },
            ],

            // === Node plugin (replaces eslint-plugin-node) ===
            "n/no-sync": ["warn"],

            // === Import rules (replaces eslint-plugin-import) ===
            "import-x/order": ["off"],
            "import-x/no-cycle": ["warn"],
            // Disabled: import-x/no-unused-modules is incompatible with flat config
            // (requires FileEnumerator API which was removed in ESLint 9+)
            // "import-x/no-unused-modules": ["off"],

            // === Import sorting (replaces sort-imports-es6-autofix) ===
            "simple-import-sort/imports": ["warn"],
            "simple-import-sort/exports": ["warn"],

            // === JSDoc / TSDoc ===
            "jsdoc/require-jsdoc": [
                "warn",
                {
                    publicOnly: true,
                },
            ],
            "tsdoc/syntax": ["warn"],

            // === Core ESLint rules ===
            "no-restricted-syntax": [
                "warn",
                {
                    selector: "CallExpression[callee.property.name='forEach']",
                    message: "Do not use `forEach()`, use `for/of` instead",
                },
            ],
            "no-console": ["warn"],

            // === Rules turned off (matching old config) ===
            "no-lonely-if": ["off"],
            "no-else-return": ["off"],
            "no-continue": ["off"],
            "no-plusplus": ["off"],
            "no-async-promise-executor": ["off"],
            "no-param-reassign": ["off"],
            "prefer-destructuring": ["off"],
            "func-names": ["off"],
            "no-multi-str": ["off"],
            "no-bitwise": ["off"],
            "class-methods-use-this": ["off"],

            // === New rules from recommended not in the old config — disabled for parity ===
            "@typescript-eslint/no-explicit-any": ["off"],
            "@typescript-eslint/no-non-null-asserted-optional-chain": ["off"],
            "@typescript-eslint/no-wrapper-object-types": ["off"],
            "@typescript-eslint/no-require-imports": ["off"],
            "no-useless-escape": ["off"],
        },
    },
);
