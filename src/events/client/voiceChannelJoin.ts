import Eris from "eris";
import { state } from "../../kmq";
import { isUserPremium, getGuildPreference } from "../../helpers/game_utils";

export default async function voiceChannelJoinHandler(member: Eris.Member, newChannel: Eris.VoiceChannel) {
    const guildID = newChannel.guild.id;
    const gameSession = state.gameSessions[guildID];
    if (newChannel.id === gameSession.voiceChannelID && await isUserPremium(member.id)) {
        await gameSession.addPremiumParticipant(member.id, await getGuildPreference(guildID));
    }
}
