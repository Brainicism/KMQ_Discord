const path = require("path");

module.exports = {
    extends: ["plugin:i18n-json/recommended"],
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
};
