import Eris from "eris";

import { state } from "../../kmq_worker";

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

    if (
        newChannel.id !== gameSession.voiceChannelID ||
        member.id === process.env.BOT_CLIENT_ID
    ) {
        return;
    }

    const oldPremiumState = gameSession.isPremiumGame();
    await gameSession.setPlayerInVC(member.id, true);
    if (oldPremiumState !== gameSession.isPremiumGame()) {
        gameSession.updatePremiumStatus();
    }
}
