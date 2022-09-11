/* eslint-disable no-template-curly-in-string */
/* eslint-disable @typescript-eslint/quotes */

import { IPCLogger } from "../logger";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
    ModuleKind,
    ScriptTarget,
    SyntaxKind,
    createProgram,
} from "typescript";
import LocalizationManager from "../helpers/localization_manager";
import type { CallExpression, Node } from "typescript";

const logger = new IPCLogger("missing_i18n");

const dynamicTranslationKeyAllowlist = [
    "`command.locale.language.${DEFAULT_LOCALE}`",
    "`command.locale.language.${localeType}`",
    "highestRankTitle.title",
    "rankTitle.title",
    "RANK_TITLES[0].title",
    'x["badge_name"]',
    "endGameMessage.title",
    "endGameMessage.message",
    "chooseRandom(leaderboardQuotes)",
    "gameInfoMessage.message",
    "gameInfoMessage.title",
    "getOrdinalNum(idx + 1)",
    "`command.groups.interaction.${action}.perGroupDescription`",
    "`command.groups.interaction.${action}.description`",
    "`command.exclude.interaction.${action}.perGroupDescription`",
    "`command.exclude.interaction.${action}.description`",
    "`command.include.interaction.${action}.perGroupDescription`",
    "`command.include.interaction.${action}.description`",
];

const translationInterfaceFunctions = [
    "LocalizationManager.localizer.translate",
    "LocalizationManager.localizer.translateN",
    "LocalizationManager.localizer.translateByLocale",
    "LocalizationManager.localizer.translateNByLocale",
];

const translationInternalFunctions = [
    "LocalizationManager.localizer.internalLocalizer.t",
];

const translationKeys = new Set<string>();
const dynamicTranslationKeys = new Set<string>();

function getNodeKeys(node: Node): void {
    if (node.kind === SyntaxKind.CallExpression) {
        const expression = node as CallExpression;
        const interfaceTranslation = translationInterfaceFunctions.some(
            (x) => expression.expression.getText() === x
        );

        const internalTranslation = translationInternalFunctions.some(
            (x) => expression.expression.getText() === x
        );

        if (interfaceTranslation || internalTranslation) {
            const translationKeyNode = interfaceTranslation
                ? expression.arguments[1]
                : expression.arguments[0];

            const keyText =
                translationKeyNode.kind === SyntaxKind.StringLiteral
                    ? translationKeyNode.getText().slice(1, -1)
                    : translationKeyNode.getText();

            if (translationKeyNode.kind === SyntaxKind.StringLiteral) {
                if (keyText.startsWith("misc.plural")) {
                    translationKeys.add(`${keyText}_one`);
                    translationKeys.add(`${keyText}_other`);
                } else {
                    translationKeys.add(keyText);
                }
            } else if (
                [
                    SyntaxKind.BinaryExpression,
                    SyntaxKind.ConditionalExpression,
                ].includes(translationKeyNode.kind)
            ) {
                for (const nestedChild of translationKeyNode
                    .getChildren()
                    .filter((x) => x.kind === SyntaxKind.StringLiteral)) {
                    const nestedChildKeyText = nestedChild
                        .getText()
                        .slice(1, -1);

                    translationKeys.add(nestedChildKeyText);
                }
            } else if (!dynamicTranslationKeyAllowlist.includes(keyText)) {
                dynamicTranslationKeys.add(keyText);
            }

            logger.info(
                `    - ${SyntaxKind[translationKeyNode.kind]} | ${keyText}`
            );
        }
    }

    for (const child of node.getChildren()) {
        getNodeKeys(child);
    }
}

(() => {
    const filenames = process.argv.slice(2);
    const program = createProgram(filenames, {
        target: ScriptTarget.ES2019,
        module: ModuleKind.CommonJS,
    });

    program.getTypeChecker();
    for (const sourceFile of program
        .getSourceFiles()
        .filter((x) => !x.fileName.includes("node_modules"))) {
        logger.info(`Parsing ${sourceFile.fileName}...`);
        getNodeKeys(sourceFile);
    }

    const localizationManager = new LocalizationManager();
    const missingKeys = Array.from(translationKeys).filter(
        (key) => !localizationManager.hasKey(key)
    );

    for (const missingKey of missingKeys) {
        logger.error(
            `(!) "${missingKey}" is missing from the translation file.`
        );
    }

    for (const missingKey of dynamicTranslationKeys) {
        logger.error(
            `(?) "${missingKey}" is not in the dynamic allow list. Manually verify that the translations are present, then add them to the allow-list.`
        );
    }

    if (missingKeys.length > 0 || dynamicTranslationKeys.size > 0) {
        process.exit(1);
    }
})();
