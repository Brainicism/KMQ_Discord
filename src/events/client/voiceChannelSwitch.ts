import Eris from "eris";
import { state } from "../../kmq_worker";
import { checkBotIsAlone } from "../../helpers/discord_utils";

export default async function voiceChannelSwitchHandler(
    member: Eris.Member,
    newChannel: Eris.VoiceChannel,
    oldChannel: Eris.VoiceChannel
): Promise<void> {
    const guildID = oldChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (!gameSession) {
        return;
    }

    if (checkBotIsAlone(guildID)) {
        gameSession.endSession();
        return;
    }

    if (!gameSession.finished) {
        gameSession.updateOwner();
    }
}
