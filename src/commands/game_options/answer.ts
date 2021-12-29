import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("answer");

export enum AnswerType {
    TYPING = "typing",
    TYPING_TYPOS = "typingtypos",
    MULTIPLE_CHOICE_EASY = "easy",
    MULTIPLE_CHOICE_MED = "medium",
    MULTIPLE_CHOICE_HARD = "hard",
}

export const DEFAULT_ANSWER_TYPE = AnswerType.TYPING;

export default class AnswerCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "answerType",
                type: "enum" as const,
                enums: Object.values(AnswerType),
            },
        ],
    };

    help = (guildID: string) => ({
            name: "answer",
            description: state.localizer.translate(guildID,
                "Choose how to answer: by typing your answer, or via multiple choice. Options are the following, `{{{typing}}}`, `{{{typingtypos}}}`, `{{{easy}}}`, `{{{medium}}}`, and `{{{hard}}}`. Playing on multiple choice mode reduces EXP by (0.25x, 0.5x, 0.75x) based on difficulty.",
                {
                    typing: `\`${AnswerType.TYPING}\``,
                    typingtypos: `\`${AnswerType.TYPING_TYPOS}\``,
                    easy: `\`${AnswerType.MULTIPLE_CHOICE_EASY}\``,
                    medium: `\`${AnswerType.MULTIPLE_CHOICE_MED}\``,
                    hard: `\`${AnswerType.MULTIPLE_CHOICE_HARD}\``,
                }
            ),
            usage: ",answer [answerType]",
            examples: [
                {
                    example: "`,answer typing`",
                    explanation: state.localizer.translate(guildID,
                        "Type your answer in the chat to guess"
                    ),
                },
                {
                    example: "`,answer typingtypos`",
                    explanation: state.localizer.translate(guildID,
                        "Type your answer in the chat to guess. Small typos will be marked as correct. 0.8x EXP penalty will be applied."
                    ),
                },
                {
                    example: "`,answer easy`",
                    explanation: state.localizer.translate(guildID,
                        "Click on the button from {{{optionCount}}} multiple choice options to guess. {{{penalty}}} EXP penalty will be applied.", { optionCount: String(4), penalty: "0.25x" }
                    ),
                },
                {
                    example: "`,answer medium`",
                    explanation: state.localizer.translate(guildID,
                        "Click on the button from {{{optionCount}}} multiple choice options to guess. {{{penalty}}} EXP penalty will be applied.", { optionCount: String(6), penalty: "0.5x" }
                    ),
                },
                {
                    example: "`,answer hard`",
                    explanation: state.localizer.translate(guildID,
                        "Click on the button from {{{optionCount}}} multiple choice options to guess. {{{penalty}}} EXP penalty will be applied.", { optionCount: String(8), penalty: "0.75x" }
                    ),
                },
            ],
        });

    helpPriority = 150;

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.ANSWER_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.ANSWER_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Answer type reset.`);
            return;
        }

        const answerType = parsedMessage.components[0] as AnswerType;
        await guildPreference.setAnswerType(answerType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.ANSWER_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Answer type set to ${answerType}`
        );
    };
}
