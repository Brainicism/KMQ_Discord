/* eslint-disable no-template-curly-in-string */
/* eslint-disable @typescript-eslint/quotes */

import { IPCLogger } from "../logger.js";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
    ModuleKind,
    ScriptTarget,
    SyntaxKind,
    createProgram,
} from "typescript";
import i18n from "../helpers/localization_manager";
import type { CallExpression, Node } from "typescript";

const logger = new IPCLogger("missing_i18n");

const dynamicTranslationKeyAllowlist = [
    "`command.locale.language.${DEFAULT_LOCALE}`",
    "`command.locale.language.${localeType}`",
    "highestRankTitle.title",
    "rankTitle.title",
    "ProfileCommand.RANK_TITLES[0]!.title",
    'x["badge_name"]',
    "endGameMessage.title",
    "endGameMessage.message",
    `chooseRandom(LeaderboardCommand.leaderboardQuotes,)`,
    "gameInfoMessage.message",
    "gameInfoMessage.title",
    "getOrdinalNum(idx+1)",
    "`command.groups.interaction.${action}.perGroupDescription`",
    "`command.groups.interaction.${action}.description`",
    "`command.exclude.interaction.${action}.perGroupDescription`",
    "`command.exclude.interaction.${action}.description`",
    "`command.include.interaction.${action}.perGroupDescription`",
    "`command.include.interaction.${action}.description`",
    "`command.${commandName}.help.name`",
    "translationKey",
    "feedbackQuestion.question",
    "feedbackQuestion.placeholder",
    "FeedbackCommand.FEEDBACK_QUESTIONS[questionIndex]!.question",
    "`command.upcomingreleases.${release.releaseType}`",
    "`command.include.help.interaction.${action}.description`",
    "`command.include.help.interaction.${action}.perGroupDescription`",
    "`command.exclude.help.interaction.${action}.description`",
    "`command.exclude.help.interaction.${action}.perGroupDescription`",
    "`command.groups.help.interaction.${action}.description`",
    "`command.groups.help.interaction.${action}.perGroupDescription`",
    "`command.${command.slashCommandAlias}.help.name`",
];

const translationInterfaceFunctions = ["i18n.translate", "i18n.translateN"];

const translationInternalFunctions = ["i18n.internalLocalizer.t"];

const translationKeys = new Set<string>();
const dynamicTranslationKeys = new Set<string>();

function getNodeKeys(node: Node): void {
    if (node.kind === SyntaxKind.CallExpression) {
        const expression = node as CallExpression;
        const interfaceTranslation = translationInterfaceFunctions.some(
            (x) => expression.expression.getText() === x,
        );

        const internalTranslation = translationInternalFunctions.some(
            (x) => expression.expression.getText() === x,
        );

        if (interfaceTranslation || internalTranslation) {
            const translationKeyNode = interfaceTranslation
                ? expression.arguments[1]
                : expression.arguments[0];

            if (!translationKeyNode) {
                return;
            }

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
            } else if (
                !dynamicTranslationKeyAllowlist.includes(
                    keyText.replace(/\s/g, ""),
                )
            ) {
                dynamicTranslationKeys.add(keyText.replace(/\s/g, ""));
            }

            logger.info(
                `    - ${SyntaxKind[translationKeyNode.kind]} | ${keyText}`,
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

    const missingKeys = Array.from(translationKeys).filter(
        (key) => !i18n.hasKey(key),
    );

    for (const missingKey of missingKeys) {
        logger.error(
            `(!) "${missingKey}" is missing from the translation file.`,
        );
    }

    for (const missingKey of dynamicTranslationKeys) {
        logger.error(
            `(?) "${missingKey}" is not in the dynamic allow list. Manually verify that the translations are present, then add them to the allow-list.`,
        );
    }

    if (missingKeys.length > 0 || dynamicTranslationKeys.size > 0) {
        process.exit(1);
    }
})();
