import { IPCLogger } from "../../logger";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import Session from "../../structures/session";
import type Eris from "eris";

const logger = new IPCLogger("voiceChannelSwitch");

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
        logger.info(
            `gid: ${newChannel.guild.id}, uid: ${member.id} | Voice channel is empty, ending session`,
        );

        session.endSession(
            "Voice channel is empty, during voice channel switch",
        );
        return;
    }

    if (session.isGameSession()) {
        if (member.id !== process.env.BOT_CLIENT_ID) {
            logger.info(
                `gid: ${newChannel.guild.id}, uid: ${member.id} | Player ${
                    newChannel.id === session.voiceChannelID ? "joined" : "left"
                } the voice channel`,
            );

            await session.setPlayerInVC(
                member.id,
                newChannel.id === session.voiceChannelID,
            );
        } else {
            logger.info(
                `gid: ${newChannel.guild.id}, uid: ${member.id} | Bot was moved to another VC`,
            );
            // Bot was moved to another VC
            session.voiceChannelID = newChannel.id;
            await session.syncAllVoiceMembers();
        }
    }

    logger.info(
        `gid: ${newChannel.guild.id}, uid: ${member.id} | Updating premium status and owner`,
    );
    await session.updatePremiumStatus();
    session.updateOwner();
}
