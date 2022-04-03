import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

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
        arguments: [
            {
                enums: Object.values(AnswerType),
                name: "answerType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.answer.help.description",
            {
                easy: `\`${AnswerType.MULTIPLE_CHOICE_EASY}\``,
                hard: `\`${AnswerType.MULTIPLE_CHOICE_HARD}\``,
                medium: `\`${AnswerType.MULTIPLE_CHOICE_MED}\``,
                typing: `\`${AnswerType.TYPING}\``,
                typingtypos: `\`${AnswerType.TYPING_TYPOS}\``,
            }
        ),
        examples: [
            {
                example: "`,answer typing`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.answer.help.example.typing"
                ),
            },
            {
                example: "`,answer typingtypos`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.answer.help.example.typingTypos"
                ),
            },
            {
                example: "`,answer easy`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    { optionCount: String(4), penalty: "0.25x" }
                ),
            },
            {
                example: "`,answer medium`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    { optionCount: String(6), penalty: "0.5x" }
                ),
            },
            {
                example: "`,answer hard`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.answer.help.example.multipleChoice",
                    { optionCount: String(8), penalty: "0.75x" }
                ),
            },
        ],
        name: "answer",
        priority: 150,
        usage: ",answer [typing | typingtypos | easy | medium | hard]",
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
