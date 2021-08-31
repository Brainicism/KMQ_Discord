import Eris from "eris";
import { state } from "../../kmq";
import { isUserPremium } from "../../helpers/game_utils";

export default async function voiceChannelJoinHandler(member: Eris.Member, newChannel: Eris.VoiceChannel) {
    const guildID = newChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (!gameSession || gameSession.finished) {
        return;
    }

    if (newChannel.id !== gameSession.voiceChannelID) {
        return;
    }

    if (await isUserPremium(member.id)) {
        gameSession.updatePremiumStatus(true);
    }
}
