import BaseCommand, { CommandArgs } from "./base_command";
import _logger from "../logger";
import { getGuildPreference, GameOption } from "../helpers/game_utils";
import { sendOptionsMessage, getDebugContext } from "../helpers/discord_utils";
const logger = _logger("mode");

enum MODE_TYPE {
    SONG_NAME = "song",
    ARTIST = "artist"
}

class ModeCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guild.id);
        const modeType = parsedMessage.components[0].toLowerCase();
        guildPreference.setModeType(modeType as MODE_TYPE);
        await sendOptionsMessage(message, guildPreference, GameOption.MODE_TYPE);
        logger.info(`${getDebugContext(message)} | Mode type set to ${modeType}`);
    }

    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "modeType",
                type: "enum" as const,
                enums: Object.values(MODE_TYPE)
            }
        ]
    }

    help = {
        name: "mode",
        description: "Choose whether to guess by song title or artist name.",
        usage: "!mode [guessType]",
        arguments: [
            {
                name: "guessType",
                description: "Valid values are \`artist\` and \`song\`"
            }
        ]
    }
}

export default ModeCommand;
export {
    MODE_TYPE
}
