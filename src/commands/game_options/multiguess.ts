import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("multiguess");
export enum MultiGuessType {
    ON = "on",
    OFF = "off",
}

export const DEFAULT_MULTIGUESS_TYPE = MultiGuessType.ON;

export default class MultiGuessCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "multiguess_type",
                type: "enum" as const,
                enums: Object.values(MultiGuessType),
            },
        ],
    };

    help = {
        name: "multiguess",
        description: "Sets whether multiple people can guess a song correctly. When `on`, players will have 1.5 seconds after the first correct answer is given, to continue to answer.\
        The first answer receives full EXP, correct answers that come after receive multiplicatively less EXP.",
        usage: ",multiguess [on | off]",
        examples: [
            {
                example: "`,multiguess on`",
                explanation: "Allows for a 1.5 second grace period from when the first correct guess occurs. Multiple players are able to guess correctly.",
            },
            {
                example: "`,multiguess off`",
                explanation: "Only the first person who guesses correct is awarded the point.",
            },
            {
                example: "`,multiguess`",
                explanation: `Reset to the default multiguess type of \`${DEFAULT_MULTIGUESS_TYPE}\``,
            },
        ],
        priority: 150,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetMultiGuessType();
            logger.info(`${getDebugLogHeader(message)} | Multiguess type reset.`);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.MULTIGUESS, reset: true });
            return;
        }

        const multiGuessType = parsedMessage.components[0] as MultiGuessType;
        guildPreference.setMultiGuessType(multiGuessType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.MULTIGUESS, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Multiguess type set to ${multiGuessType}`);
    }
}
