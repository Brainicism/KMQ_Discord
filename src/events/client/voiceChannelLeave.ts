import { IPCLogger } from "../../logger";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import Session from "../../structures/session";
import type Eris from "eris";

const logger = new IPCLogger("voiceChannelLeave");

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
        logger.info(
            `gid: ${oldChannel.guild.id}, uid: ${member.id} | Voice channel is empty, ending session`,
        );

        session.endSession(
            "Voice channel is empty, during voice channel leave",
        );
        return;
    }

    if (session.isGameSession()) {
        logger.info(
            `gid: ${oldChannel.guild.id}, uid: ${member.id} | Player left the voice channel`,
        );
        await session.setPlayerInVC(member.id, false);
    }

    logger.info(
        `gid: ${oldChannel.guild.id}, uid: ${member.id} | Updating premium status and owner`,
    );
    await session.updatePremiumStatus();
    session.updateOwner();
}
