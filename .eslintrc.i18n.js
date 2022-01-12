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
    },
};
