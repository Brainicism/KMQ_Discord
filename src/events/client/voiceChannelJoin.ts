import Eris from "eris";
import { state } from "../../kmq_worker";
import { isUserPremium } from "../../helpers/game_utils";

/**
 * @param member - The member that joined the voice channel
 * @param newChannel - The voice channel that the member joined
 */
export default async function voiceChannelJoinHandler(
    member: Eris.Member,
    newChannel: Eris.VoiceChannel
): Promise<void> {
    const gameSession = state.gameSessions[newChannel.guild.id];
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
