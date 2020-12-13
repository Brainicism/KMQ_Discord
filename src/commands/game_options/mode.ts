import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugContext } from "../../helpers/discord_utils";
import { GameOption } from "../../types";

const logger = _logger("mode");

export enum ModeType {
    SONG_NAME = "song",
    ARTIST = "artist",
    BOTH = "both",
}

export const DEFAULT_MODE = ModeType.SONG_NAME;

export default class ModeCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const modeType = parsedMessage.components.length > 0 ? parsedMessage.components[0].toLowerCase() as ModeType : DEFAULT_MODE;
        guildPreference.setModeType(modeType);
        await sendOptionsMessage(message, guildPreference, GameOption.MODE_TYPE);
        logger.info(`${getDebugContext(message)} | Mode type set to ${modeType}`);
    }

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "modeType",
                type: "enum" as const,
                enums: Object.values(ModeType),
            },
        ],
    };

    help = {
        name: "mode",
        description: "Choose whether to guess by song title or artist name. Valid values are `artist`, `song`, or `both`",
        usage: "!mode [guessType]",
        examples: [
            {
                example: "`!mode song`",
                explanation: "Type the correct song name to win a game round",
            },
            {
                example: "`!mode artist`",
                explanation: "Type the correct name of the artist to win a game round",
            },
            {
                example: "`!mode both`",
                explanation: "Type the correct name of the artist (0.2 points) or the name of the song (1 point) to win a game round",
            },
            {
                example: "`!mode`",
                explanation: `Reset to the default mode of \`${DEFAULT_MODE}\``,
            },
        ],
        priority: 130,
    };
}
