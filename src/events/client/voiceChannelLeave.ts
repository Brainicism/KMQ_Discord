import Eris from "eris";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import Session from "../../structures/session";
import GameSession from "../../structures/game_session";
import MusicSession from "../../structures/music_session";

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
    const session = Session.getSession(guildID);
    if (!session || session.finished) {
        return;
    }

    if (oldChannel.id !== session.voiceChannelID) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        session.endSession();
        return;
    }

    const oldPremiumState = session.isPremium();
    if (session instanceof GameSession) {
        await session.setPlayerInVC(member.id, false);
    }

    session.updateOwner();

    if (
        oldPremiumState !== session.isPremium() ||
        session instanceof MusicSession
    ) {
        await session.updatePremiumStatus();
    }
}
