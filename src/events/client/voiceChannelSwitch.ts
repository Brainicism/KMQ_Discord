import Eris from "eris";
import { state } from "../../kmq";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import { isUserPremium } from "../../helpers/game_utils";

export default async function voiceChannelSwitchHandler(member: Eris.Member, newChannel: Eris.VoiceChannel, oldChannel: Eris.VoiceChannel) {
    const guildID = oldChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (!gameSession || gameSession.finished) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        gameSession.endSession();
        return;
    }

    gameSession.updateOwner();
    if (oldChannel.id === gameSession.voiceChannelID && newChannel.id !== gameSession.voiceChannelID) {
        gameSession.updatePremiumStatus();
    } else if (newChannel.id === gameSession.voiceChannelID && await isUserPremium(member.id)) {
        gameSession.updatePremiumStatus();
    }
}
