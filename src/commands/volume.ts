import BaseCommand, { CommandArgs } from "./base_command";

const { sendOptionsMessage, getDebugContext, GameOptions } = require("../helpers/utils");
const DEFAULT_VOLUME = 50;
const logger = require("../logger")("volume");
class VolumeCommand implements BaseCommand {
    call({ message, parsedMessage, gameSessions, guildPreference, db }: CommandArgs) {
        guildPreference.setVolume(parseInt(parsedMessage.components[0]), db);
        let gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.dispatcher) {
            gameSession.dispatcher.setVolume(
                gameSession.isSongCached ? guildPreference.getCachedStreamVolume() : guildPreference.getStreamVolume()
            );
        }
        sendOptionsMessage(message, guildPreference, db, GameOptions.VOLUME);
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
