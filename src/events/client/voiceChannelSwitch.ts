import { checkBotIsAlone } from "../../helpers/discord_utils";
import Session from "../../structures/session";
import type Eris from "eris";

/**
 * Handles the 'voiceChannelSwitch' event
 * @param member - The member that left the voice channel
 * @param newChannel - The voice channel the member joined
 * @param oldChannel - The voice channel the member left
 */
export default async function voiceChannelSwitchHandler(
    member: Eris.Member,
    newChannel: Eris.VoiceChannel,
    oldChannel: Eris.VoiceChannel,
): Promise<void> {
    const guildID = oldChannel.guild.id;
    const session = Session.getSession(guildID);
    if (!session || session.finished) {
        return;
    }

    if (
        newChannel.id !== session.voiceChannelID &&
        oldChannel.id !== session.voiceChannelID
    ) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        session.endSession(
            "Voice channel is empty, during voice channel switch",
        );
        return;
    }

    if (session.isGameSession()) {
        if (member.id !== process.env.BOT_CLIENT_ID) {
            await session.setPlayerInVC(
                member.id,
                newChannel.id === session.voiceChannelID,
            );
        } else {
            // Bot was moved to another VC
            session.voiceChannelID = newChannel.id;
            await session.syncAllVoiceMembers();
        }
    }

    await session.updatePremiumStatus();
    session.updateOwner();
}
