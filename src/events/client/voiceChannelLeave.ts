import Eris from "eris";
import state from "../../kmq";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import { endSession } from "../../helpers/game_utils";

export default async function voiceChannelLeaveHandler(member: Eris.Member, oldChannel: Eris.VoiceChannel) {
    const guildID = oldChannel.guild.id;
    if (checkBotIsAlone(guildID)) {
        const gameSession = state.gameSessions[guildID];
        if (gameSession) {
            endSession(gameSession);
        }
    }
}
