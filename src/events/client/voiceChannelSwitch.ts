import Eris from "eris";
import { state } from "../../kmq_worker";
import { checkBotIsAlone } from "../../helpers/discord_utils";
import { isUserPremium } from "../../helpers/game_utils";

/**
 * Handles the 'voiceChannelSwitch' event
 * @param member - The member that left the voice channel
 * @param newChannel - The voice channel the member joined
 * @param oldChannel - The voice channel the member left
 */
export default async function voiceChannelSwitchHandler(
    member: Eris.Member,
    newChannel: Eris.VoiceChannel,
    oldChannel: Eris.VoiceChannel
): Promise<void> {
    const guildID = oldChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (!gameSession || gameSession.finished) {
        return;
    }

    if (
        newChannel.id !== gameSession.voiceChannelID &&
        oldChannel.id !== gameSession.voiceChannelID
    ) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        gameSession.endSession();
        return;
    }

    if (!gameSession.finished) {
        if (member.id !== process.env.BOT_CLIENT_ID) {
            gameSession.setPlayerInVC(
                member.id,
                newChannel.id === gameSession.voiceChannelID
            );
            if (await isUserPremium(member.id)) {
                const premiumMemberSwitchedIn =
                    newChannel.id === gameSession.voiceChannelID;

                gameSession.updatePremiumStatus(premiumMemberSwitchedIn);
            }
        } else {
            // Bot was moved to another VC
            gameSession.voiceChannelID = newChannel.id;
            gameSession.syncAllVoiceMembers();
        }

        gameSession.updateOwner();
    }
}
