import { IPCLogger } from "../logger";
// eslint-disable-next-line import/no-extraneous-dependencies
import { ScriptTarget, SyntaxKind, createSourceFile } from "typescript";
import { readFileSync } from "fs";
import LocalizationManager from "../helpers/localization_manager";
import type { Node } from "typescript";

const logger = new IPCLogger("missing_i18n");

const dynamicTranslationKeyAllowlist = [
    "getOrdinalNum(idx + 1)",
    // eslint-disable-next-line no-template-curly-in-string
    "`command.locale.language.${DEFAULT_LOCALE}`",
    // eslint-disable-next-line no-template-curly-in-string
    "`command.locale.language.${language}`",
    "highestRankTitle.title",
    "rankTitle.title",
    "RANK_TITLES[0].title",
    "x[\"badge_name\"]",
    "endGameMessage.title",
    "endGameMessage.message",
    "chooseRandom(leaderboardQuotes)",
    "gameInfoMessage.message",
    "gameInfoMessage.title",
    "Number((process.uptime() / (60 * 60)).toFixed(2))",
    "Math.max(Math.ceil(timeRemaining), 0)",
    "Math.ceil(timeRemaining)",
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
        for (const child of node
            .getChildren()
            .flatMap((x) => x.getChildren())) {
            if (child.kind === SyntaxKind.StringLiteral) {
                keys.add(child.getText());
            } else if (
                [
                    SyntaxKind.BinaryExpression,
                    SyntaxKind.ConditionalExpression,
                ].includes(child.kind)
            ) {
                for (const nestedChild of child
                    .getChildren()
                    .filter((x) => x.kind === SyntaxKind.StringLiteral)) {
                    keys.add(nestedChild.getText());
                }
            } else if (child.kind === SyntaxKind.CallExpression) {
                if (!dynamicTranslationKeyAllowlist.includes(child.getText())) {
                    logger.error(
                        `"${child.getText()}" is not in the dynamic allow list`
                    );
                }
            }
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
