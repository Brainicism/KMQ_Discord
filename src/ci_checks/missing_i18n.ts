import { IPCLogger } from "../logger";
// eslint-disable-next-line import/no-extraneous-dependencies
import { ScriptTarget, SyntaxKind, createSourceFile } from "typescript";
import { readFileSync } from "fs";
import LocalizationManager from "../helpers/localization_manager";
import type { CallExpression, Node } from "typescript";

const logger = new IPCLogger("missing_i18n");

const dynamicTranslationKeyAllowlist = [
    // eslint-disable-next-line no-template-curly-in-string
    "`command.locale.language.${DEFAULT_LOCALE}`",
    // eslint-disable-next-line no-template-curly-in-string
    "`command.locale.language.${language}`",
    "highestRankTitle.title",
    "rankTitle.title",
    "RANK_TITLES[0].title",
    // eslint-disable-next-line @typescript-eslint/quotes
    'x["badge_name"]',
    "endGameMessage.title",
    "endGameMessage.message",
    "chooseRandom(leaderboardQuotes)",
    "gameInfoMessage.message",
    "gameInfoMessage.title",
];

const translationInterfaceFunctions = [
    "LocalizationManager.localizer.translate",
    "LocalizationManager.localizer.translateN",
    "LocalizationManager.localizer.translateByLocale",
    "LocalizationManager.localizer.translateNByLocale",
];

const translationInternalFunctions = [
    "LocalizationManager.internalLocalizer.t",
];

function getNodeKeys(node: Node): Array<string> {
    const keys = new Set<string>();
    const interfaceTranslation = translationInterfaceFunctions.some((x) =>
        node.getText().startsWith(x)
    );

    const internalTranslation = translationInternalFunctions.some((x) =>
        node.getText().startsWith(x)
    );

    const translationNode = interfaceTranslation || internalTranslation;

    if (translationNode && node.kind === SyntaxKind.CallExpression) {
        const expression = node as CallExpression;
        const key = interfaceTranslation
            ? expression.arguments[1]
            : expression.arguments[0];

        const keyText = key.getText();

        if (key.kind === SyntaxKind.StringLiteral) {
            if (keyText.includes("plural")) {
                keys.add(`${keyText.slice(0, -1)}_one"`);
                keys.add(`${keyText.slice(0, -1)}_other"`);
            } else {
                keys.add(keyText);
            }
        } else if (
            [
                SyntaxKind.BinaryExpression,
                SyntaxKind.ConditionalExpression,
            ].includes(key.kind)
        ) {
            for (const nestedChild of key
                .getChildren()
                .filter((x) => x.kind === SyntaxKind.StringLiteral)) {
                keys.add(nestedChild.getText());
            }
        } else if (!dynamicTranslationKeyAllowlist.includes(keyText)) {
            logger.error(`"${keyText}" is not in the dynamic allow list`);
        }
    }

    for (const child of node.getChildren()) {
        const childKeys = getNodeKeys(child);
        for (const key of childKeys) {
            keys.add(key);
        }
    }

    return Array.from(keys);
}

(() => {
    const filenames = process.argv.slice(2);
    const keys = new Set<string>();
    for (const file of filenames) {
        const sourceFile = createSourceFile(
            file,
            readFileSync(file).toString(),
            ScriptTarget.ES2019,
            true
        );

        const fileKeys = getNodeKeys(sourceFile);
        for (const key of fileKeys) {
            keys.add(key);
        }
    }

    const keysArray = Array.from(keys).map((x) => x.slice(1, -1));
    const localizationManager = new LocalizationManager();
    const missingKeys = keysArray.filter(
        (key) => !localizationManager.hasKey(key)
    );

    if (missingKeys.length > 0) {
        for (const missingKey of missingKeys) {
            logger.error(`"${missingKey}" is missing`);
        }

        process.exit(1);
    }
})();
