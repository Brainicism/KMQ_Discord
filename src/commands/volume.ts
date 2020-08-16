import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext, sendInfoMessage } from "../helpers/discord_utils";
import { GameOption, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("volume");
export const DEFAULT_VOLUME = 50;

export default class VolumeCommand implements BaseCommand {
    async call({ message, parsedMessage, gameSessions }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        guildPreference.setVolume(parseInt(parsedMessage.components[0]));
        const gameSession = gameSessions[message.guildID];
        if (gameSession && gameSession.connection) {
            gameSession.connection.setVolume(guildPreference.getStreamVolume());
        }
        await sendOptionsMessage(message, guildPreference, GameOption.VOLUME);
        await sendInfoMessage(message, "Deprecation Warning", "This command is scheduled to be discontinued shortly. Please modify the bot's volume by right clicking it instead.");
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
