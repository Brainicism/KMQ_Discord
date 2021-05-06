import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("guessmode");

export enum GuessModeType {
    SONG_NAME = "song",
    ARTIST = "artist",
    BOTH = "both",
}

export const DEFAULT_GUESS_MODE = GuessModeType.SONG_NAME;

export default class GuessModeCommand implements BaseCommand {
    aliases = ["mode"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "guessModeType",
                type: "enum" as const,
                enums: Object.values(GuessModeType),
            },
        ],
    };

    help = {
        name: "guessmode",
        description: "Choose whether to guess by song title or artist name. Valid values are `artist`, `song`, or `both`",
        usage: ",guessmode [guessType]",
        examples: [
            {
                example: "`,guessmode song`",
                explanation: "Type the correct song name to win a game round",
            },
            {
                example: "`,guessmode artist`",
                explanation: "Type the correct name of the artist to win a game round",
            },
            {
                example: "`,guessmode both`",
                explanation: "Type the correct name of the artist (0.2 points) or the name of the song (1 point) to win a game round",
            },
            {
                example: "`,guessmode`",
                explanation: `Reset to the default guess mode of \`${DEFAULT_GUESS_MODE}\``,
            },
        ],
        priority: 130,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.resetGuessModeType();
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GUESS_MODE_TYPE, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Guess mode type reset.`);
            return;
        }

        const modeType = parsedMessage.components[0].toLowerCase() as GuessModeType;
        await guildPreference.setGuessModeType(modeType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GUESS_MODE_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Guess mode type set to ${modeType}`);
    }
}
