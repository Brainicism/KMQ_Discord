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

const logger = new IPCLogger("answer");
export enum AnswerType {
    TYPING = "typing",
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

    help = {
        name: "answer",
        description:
            "Choose how to answer: by typing your answer, or via multiple choice. Options are the following, `typing`, `easy`, `medium`, and `hard`. Playing on multiple choice mode reduces EXP by (0.25x, 0.5x, 0.75x) based on difficulty",
        usage: ",answer [answerType]",
        examples: [
            {
                example: "`,answer typing`",
                explanation: "Type your answer in the chat to guess",
            },
            {
                example: "`,answer easy`",
                explanation:
                    "Click on the button from 4 multiple choice options to guess",
            },
            {
                example: "`,answer medium`",
                explanation:
                    "Click on the button from 6 multiple choice options to guess",
            },
            {
                example: "`,answer hard`",
                explanation:
                    "Click on the button from 8 multiple choice options to guess",
            },
        ],
        priority: 150,
    };

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
