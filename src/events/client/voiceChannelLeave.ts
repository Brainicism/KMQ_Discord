import Eris from "eris";
import { state } from "../../kmq_worker";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import { isUserPremium } from "../../helpers/game_utils";

/**
 * Handles the 'voiceChannelLeave' event
 * @param member - The member that left the voice channel
 * @param oldChannel - The voice channel the member left
 */
export default async function voiceChannelLeaveHandler(
    member: Eris.Member,
    oldChannel: Eris.VoiceChannel
): Promise<void> {
    const guildID = oldChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (!gameSession || gameSession.finished) {
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
    if (await isUserPremium(member.id)) {
        gameSession.updatePremiumStatus(false);
    }
}
