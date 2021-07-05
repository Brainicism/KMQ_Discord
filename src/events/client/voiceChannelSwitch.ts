import Eris from "eris";
import state from "../../kmq";
import { checkBotIsAlone } from "../../helpers/discord_utils";

export default async function voiceChannelSwitchHandler(member: Eris.Member, newChannel: Eris.VoiceChannel, oldChannel: Eris.VoiceChannel) {
    const guildID = oldChannel.guild.id;
    if (checkBotIsAlone(guildID)) {
        const gameSession = state.gameSessions[guildID];
        if (gameSession) {
            gameSession.endSession();
        }
    }
}
