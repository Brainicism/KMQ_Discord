import Session from "../../structures/session";
import type Eris from "eris";

/**
 * @param member - The member that joined the voice channel
 * @param newChannel - The voice channel that the member joined
 */
export default async function voiceChannelJoinHandler(
    member: Eris.Member,
    newChannel: Eris.VoiceChannel,
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

    if (session.isGameSession()) {
        await session.setPlayerInVC(member.id, true);
    }

    session.updatePremiumStatus();
}
