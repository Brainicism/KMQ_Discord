import { checkBotIsAlone } from "../../helpers/discord_utils";
import Session from "../../structures/session";
import type Eris from "eris";

/**
 * Handles the 'voiceChannelLeave' event
 * @param member - The member that left the voice channel
 * @param oldChannel - The voice channel the member left
 */
export default async function voiceChannelLeaveHandler(
    member: Eris.Member,
    oldChannel: Eris.VoiceChannel,
): Promise<void> {
    const guildID = oldChannel.guild.id;
    const session = Session.getSession(guildID);
    if (!session || session.finished) {
        return;
    }

    if (oldChannel.id !== session.voiceChannelID) {
        return;
    }

    if (member.id === process.env.BOT_CLIENT_ID) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        session.endSession(
            "Voice channel is empty, during voice channel leave",
        );
        return;
    }

    if (session.isGameSession()) {
        await session.setPlayerInVC(member.id, false);
    }

    await session.updatePremiumStatus();
    session.updateOwner();
}
