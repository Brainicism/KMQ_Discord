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

    if (checkBotIsAlone(guildID)) {
        gameSession.endSession();
        return;
    }

    if (gameSession.finished) {
        return;
    }

    gameSession.updateOwner();

    if (await isUserPremium(member.id)) {
        const premiumMemberSwitchedOut =
            oldChannel.id === gameSession.voiceChannelID &&
            newChannel.id !== gameSession.voiceChannelID;

        const premiumMemberSwitchedIn =
            newChannel.id === gameSession.voiceChannelID;

        if (premiumMemberSwitchedIn || premiumMemberSwitchedOut) {
            gameSession.updatePremiumStatus(premiumMemberSwitchedIn);
        }
    }
}
