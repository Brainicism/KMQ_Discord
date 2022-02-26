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

    if (newChannel.id !== gameSession.voiceChannelID) {
        return;
    }

    gameSession.setPlayerInVC(member.id, true);
}
