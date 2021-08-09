import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("answer");
export enum AnswerType {
    TYPING = "typing",
    MULTIPLE_CHOICE_EASY = "mc_easy",
    MULTIPLE_CHOICE_MED = "mc_med",
    MULTIPLE_CHOICE_HARD = "mc_hard",
}

export const DEFAULT_ANSWER_TYPE = AnswerType.TYPING;

export default class AnswerCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "artist_Type",
                type: "enum" as const,
                enums: Object.values(AnswerType),
            },
        ],
    };

    help = {
        name: "answer",
        description: "Choose how to answer: by typing your answer, or via multiple choice. Options are the following, `typing`, `mc_easy`, `mc_medium`, and `mc_hard`.",
        usage: ",answer [answerType]",
        examples: [
            {
                example: "`,answer typing`",
                explanation: "Type your answer in the chat to guess",
            },
            {
                example: "`,answer mc_easy`",
                explanation: "Click on the button from 3 multiple choice options to guess",
            },
            {
                example: "`,answer mc_medium`",
                explanation: "Click on the button from 5 multiple choice options to guess",
            },
            {
                example: "`,answer mc_hard`",
                explanation: "Click on the button from 7 multiple choice options to guess",
            },
        ],
        priority: 150,
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.resetAnswerType();
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.ANSWER_TYPE, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Answer type reset.`);
            return;
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between artist type and groups.`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Conflict", description: `\`groups\` game option is currently set. \`artisttype\` and \`groups\` are incompatible. Remove the \`groups\` option by typing \`${process.env.BOT_PREFIX}groups\` to proceed` });
            return;
        }

        const answerType = parsedMessage.components[0] as AnswerType;
        await guildPreference.setAnswerType(answerType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.ANSWER_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Artist type set to ${answerType}`);
    };
}
