// @ts-check
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
    // Use FlatCompat to bridge the legacy i18n-json plugin
    ...compat.extends("plugin:i18n-json/recommended"),
    {
        files: ["i18n/**/*.json"],
        rules: {
            "i18n-json/identical-keys": [
                "warn",
                {
                    filePath: path.resolve("./i18n/en.json"),
                },
            ],
            "i18n-json/valid-message-syntax": [
                "warn",
                {
                    syntax: path.resolve("./i18n/i18next_syntax_validator.js"),
                },
            ],
            "i18n-json/sorted-keys": [
                "warn",
                {
                    order: "asc",
                    indentSpaces: 4,
                },
            ],
        },
    },
];
