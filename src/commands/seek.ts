import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext } from "../helpers/discord_utils";
import { GameOptions, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("seek");
const SEEK_TYPES: { [seekType: string]: string } = { BEGINNING: "beginning", RANDOM: "random" }

class SeekCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guild.id);
        const seekType = parsedMessage.components[0];
        guildPreference.setSeekType(seekType);
        await sendOptionsMessage(message, guildPreference, GameOptions.SEEK_TYPE);
        logger.info(`${getDebugContext(message)} | Seek type set to ${seekType}`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "seekType",
                type: "enum" as const,
                enums: Object.values(SEEK_TYPES)
            }
        ]
    }

    help = {
        name: "seek",
        description: "Choose whether each song is played from the beginning, or at a random point.",
        usage: "!seek [seekType]",
        arguments: [
            {
                name: "seekType",
                description: "Valid values are \`beginning\` or \`random\`"
            }
        ]
    }
}
export default SeekCommand;
export {
    SEEK_TYPES
}
