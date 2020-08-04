import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext } from "../helpers/discord_utils";
import { GameOptions, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("volume");
const DEFAULT_VOLUME = 50;

class VolumeCommand implements BaseCommand {
    async call({ message, parsedMessage, gameSessions, db }: CommandArgs) {
        const guildPreference = await getGuildPreference(db, message.guild.id);
        guildPreference.setVolume(parseInt(parsedMessage.components[0]), db);
        const gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.dispatcher) {
            gameSession.dispatcher.setVolume(guildPreference.getStreamVolume());
        }
        await sendOptionsMessage(message, guildPreference, db, GameOptions.VOLUME);
        logger.info(`${getDebugContext(message)} | Volume set to ${guildPreference.getVolume()}.`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "volume",
                type: "number" as const,
                minValue: 0,
                maxValue: 100
            }
        ]
    }
    help = {
        name: "volume",
        description: "Set the volume at which the bot will output your music.",
        usage: "!volume [percentage]",
        arguments: [
            {
                name: "percentage",
                description: "A valid volume value is from 1 to 100. You do not need to include the percentage symbol. The default volume is 50%."
            }
        ]
    }
}
export default VolumeCommand;
export {
    DEFAULT_VOLUME
}
