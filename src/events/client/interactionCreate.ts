import Eris from "eris";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import { getUserTag } from "../../helpers/discord_utils";
import { state } from "../../kmq";
import { getGuildPreference } from "../../helpers/game_utils";
import { GuessModeType } from "../../commands/game_options/guessmode";

export default async function interactionCreateHandler(interaction: Eris.PingInteraction | Eris.CommandInteraction | Eris.ComponentInteraction | Eris.UnknownInteraction) {
    if (interaction instanceof Eris.ComponentInteraction) {
        const gameSession = state.gameSessions[interaction.guildID];
        if (!gameSession || !gameSession.gameRound) {
            return;
        }

        const messageContext = new MessageContext(
            interaction.channelID,
            new KmqMember(interaction.member.username, getUserTag(interaction.member), interaction.member.avatarURL, interaction.member.id),
            interaction.guildID,
        );

        if (gameSession.gameRound.incorrectMCGuessers.has(interaction.member.id)) {
            interaction.acknowledge();
            return;
        }

        if (!gameSession.isValidInteractionGuess(interaction.data.custom_id)) {
            interaction.acknowledge();
            return;
        }

        if (!gameSession.isCorrectInteractionAnswer(interaction.data.custom_id)) {
            gameSession.guessSong(messageContext, "", interaction);
            gameSession.gameRound.incorrectMCGuessers.add(interaction.member.id);
            return;
        }

        const guildPreference = await getGuildPreference(messageContext.guildID);
        gameSession.guessSong(
            messageContext,
            guildPreference.getGuessModeType() !== GuessModeType.ARTIST ? gameSession.gameRound.songName : gameSession.gameRound.artistName,
            interaction,
        );
    }
}
