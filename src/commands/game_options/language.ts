import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("language");
export enum LanguageType {
    KOREAN = "korean",
    ALL = "all",
}

export const DEFAULT_LANGUAGE = LanguageType.ALL;

// z = chinese, j = japanese, e = english, s = spanish
export const FOREIGN_LANGUAGE_TAGS = ["z", "j", "e", "s"];
export default class LanguageCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "language",
                type: "enum" as const,
                enums: Object.values(LanguageType),
            },
        ],
    };

    help = {
        name: "language",
        description: "Sets korean-only or all available songs",
        usage: "!language [korean | all]",
        examples: [
            {
                example: "`!language korean`",
                explanation: "Plays only korean songs. Ignores songs that are in foreign languages: english, japanese, chinese.",
            },
            {
                example: "`!language all`",
                explanation: "Play all available songs.",
            },
            {
                example: "`!language`",
                explanation: "Reset to the default language of `all`",
            },
        ],
        priority: 150,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetLanguageType();
            logger.info(`${getDebugLogHeader(message)} | Language type reset.`);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.LANGUAGE_TYPE, reset: true });
            return;
        }

        const languageType = parsedMessage.components[0] as LanguageType;
        guildPreference.setLanguageType(languageType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.LANGUAGE_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Language type set to ${languageType}`);
    }
}
