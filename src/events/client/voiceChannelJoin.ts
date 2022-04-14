import Eris from "eris";
import GameSession from "../../structures/game_session";
import Session from "../../structures/session";
import MusicSession from "../../structures/music_session";

/**
 * @param member - The member that joined the voice channel
 * @param newChannel - The voice channel that the member joined
 */
export default async function voiceChannelJoinHandler(
    member: Eris.Member,
    newChannel: Eris.VoiceChannel
): Promise<void> {
    const session = Session.getSession(newChannel.guild.id);
    if (!session || session.finished) {
        return;
    }

    if (
        newChannel.id !== session.voiceChannelID ||
        member.id === process.env.BOT_CLIENT_ID
    ) {
        return;
    }

    const oldPremiumState = session.isPremium();
    if (session instanceof GameSession) {
        await session.setPlayerInVC(member.id, true);
    }

    if (
        oldPremiumState !== session.isPremium() ||
        session instanceof MusicSession
    ) {
        session.updatePremiumStatus();
    }
}
