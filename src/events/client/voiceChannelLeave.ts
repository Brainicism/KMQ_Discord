import Eris from "eris";
import { state } from "../../kmq";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";

export default async function voiceChannelLeaveHandler(member: Eris.Member, oldChannel: Eris.VoiceChannel) {
    const guildID = oldChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (!gameSession) {
        return;
    }

    if (oldChannel.id !== gameSession.voiceChannelID) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        gameSession.endSession();
        return;
    }

    if (gameSession.finished) {
        return;
    }

    gameSession.updateOwner();
    gameSession.removeIfPremiumParticipant(member.id, await getGuildPreference(guildID));
}
