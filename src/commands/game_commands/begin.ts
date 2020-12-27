import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameType } from "./play";
import { getDebugContext, sendInfoMessage, sendErrorMessage, getUserIdentifier, getVoiceChannel } from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import _logger from "../../logger";

const logger = _logger("begin");

export default class BeginCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const { guildID, author } = message;
        const gameSession = gameSessions[guildID];
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return;
        }
        if (gameSession.owner.id !== author.id) {
            sendErrorMessage(message, "Begin ignored", `Only the person who did \`${process.env.BOT_PREFIX}play elimination\` (${bold(getUserIdentifier(gameSession.owner))}) can start the game.`);
            return;
        }
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSession.sessionInitialized) {
            const gameInstructions = "Listen to the song and type your guess!";
            await sendInfoMessage(message, `Game starting in #${message.channel.name} in 🔊 ${getVoiceChannel(message).name}`, gameInstructions);
            gameSession.startRound(guildPreference, message);
            logger.info(`${getDebugContext(message)} | Game session starting (elimination gameType)`);
        }
    }
}
