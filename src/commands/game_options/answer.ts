import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
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

    helpPriority = 150;

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

    help = (guildID: string): Help => ({
        name: "answer",
        description: state.localizer.translate(
            guildID,
            "answer.help.description",
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
                explanation: state.localizer.translate(
                    guildID,
                    "answer.help.example.typing"
                ),
            },
            {
                example: "`,answer typingtypos`",
                explanation: state.localizer.translate(
                    guildID,
                    "answer.help.example.typingTypos"
                ),
            },
            {
                example: "`,answer easy`",
                explanation: state.localizer.translate(
                    guildID,
                    "answer.help.example.multipleChoice",
                    { optionCount: String(4), penalty: "0.25x" }
                ),
            },
            {
                example: "`,answer medium`",
                explanation: state.localizer.translate(
                    guildID,
                    "answer.help.example.multipleChoice",
                    { optionCount: String(6), penalty: "0.5x" }
                ),
            },
            {
                example: "`,answer hard`",
                explanation: state.localizer.translate(
                    guildID,
                    "answer.help.example.multipleChoice",
                    { optionCount: String(8), penalty: "0.75x" }
                ),
            },
        ],
    });

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
