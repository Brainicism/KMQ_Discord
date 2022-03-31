import Eris from "eris";
import GameSession from "../../structures/game_session";
import Session from "../../structures/session";

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

    if (session instanceof GameSession) {
        const oldPremiumState = session.isPremiumGame();
        await session.setPlayerInVC(member.id, true);
        if (oldPremiumState !== session.isPremiumGame()) {
            session.updatePremiumStatus();
        }
    }
}
