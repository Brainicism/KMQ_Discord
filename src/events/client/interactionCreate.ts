import Eris from "eris";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import { getUserTag, EMBED_ERROR_COLOR, EMBED_SUCCESS_COLOR, EMBED_SUCCESS_BONUS_COLOR, getCurrentVoiceMembers } from "../../helpers/discord_utils";
import { state } from "../../kmq";
import { getGuildPreference, userBonusIsActive } from "../../helpers/game_utils";
import { GuessModeType } from "../../commands/game_options/guessmode";
import { bold } from "../../helpers/utils";
import { KmqImages } from "../../constants";
import { BOOKMARK_MESSAGE_SIZE } from "../../structures/game_session";

export default async function interactionCreateHandler(interaction: Eris.PingInteraction | Eris.CommandInteraction | Eris.ComponentInteraction | Eris.UnknownInteraction) {
    if (interaction instanceof Eris.ComponentInteraction) {
        // Multiple choice
        const gameSession = state.gameSessions[interaction.guildID];
        if (!gameSession || !gameSession.gameRound) {
            interaction.acknowledge();
            return;
        }

        const messageContext = new MessageContext(
            interaction.channelID,
            new KmqMember(interaction.member.username, getUserTag(interaction.member), interaction.member.avatarURL, interaction.member.id),
            interaction.guildID,
        );

        if (!getCurrentVoiceMembers(gameSession.voiceChannelID).map((x) => x.id).includes(interaction.member.id)) {
            interaction.acknowledge();
            return;
        }

        if (gameSession.gameRound.incorrectMCGuessers.has(interaction.member.id)) {
            await interaction.createMessage({
                embeds: [{
                    color: EMBED_ERROR_COLOR,
                    author: {
                        name: messageContext.author.username,
                        icon_url: messageContext.author.avatarUrl,
                    },
                    title: bold("Uh-oh"),
                    description: "You've already been eliminated this round.",
                    thumbnail: { url: KmqImages.DEAD },
                }],
                flags: 64,
            });
            return;
        }

        if (!gameSession.gameRound.isValidInteractionGuess(interaction.data.custom_id)) {
            await interaction.createMessage({
                embeds: [{
                    color: EMBED_ERROR_COLOR,
                    author: {
                        name: messageContext.author.username,
                        icon_url: messageContext.author.avatarUrl,
                    },
                    title: bold("Uh-oh"),
                    description: "You are attempting to pick an option from an already completed round.",
                    thumbnail: { url: KmqImages.DEAD },
                }],
                flags: 64,
            });
            return;
        }

        if (!gameSession.gameRound.isCorrectInteractionAnswer(interaction.data.custom_id)) {
            await interaction.createMessage({
                embeds: [{
                    color: EMBED_ERROR_COLOR,
                    author: {
                        name: messageContext.author.username,
                        icon_url: messageContext.author.avatarUrl,
                    },
                    title: bold("Incorrect guess"),
                    description: "You've been eliminated this round.",
                    thumbnail: { url: KmqImages.DEAD },
                }],
                flags: 64,
            });
            gameSession.gameRound.incorrectMCGuessers.add(interaction.member.id);
            gameSession.gameRound.interactionIncorrectAnswerUUIDs[interaction.data.custom_id]++;
            await gameSession.guessSong(messageContext, "");
            return;
        }

        await interaction.acknowledge();
        const guildPreference = await getGuildPreference(messageContext.guildID);
        if (!gameSession.gameRound) return;
        await gameSession.guessSong(messageContext, guildPreference.gameOptions.guessModeType !== GuessModeType.ARTIST ? gameSession.gameRound.songName : gameSession.gameRound.artistName);
    } else if (interaction instanceof Eris.CommandInteraction) {
        // Bookmarking songs
        const gameSession = state.gameSessions[interaction.guildID];
        const song = gameSession?.getSongFromMessageID(interaction.data.target_id);
        if (!gameSession || !song) {
            interaction.createMessage({
                embeds: [{
                    color: EMBED_ERROR_COLOR,
                    author: interaction.member ? {
                        name: interaction.member.username,
                        icon_url: interaction.member.avatarURL,
                    } : null,
                    title: bold("Bookmark Error"),
                    description: `You can only bookmark songs recently played in the last ${BOOKMARK_MESSAGE_SIZE} rounds. You must bookmark the message sent by the bot containing the song.`,
                    thumbnail: { url: KmqImages.DEAD },
                }],
                flags: 64,
            });
            return;
        }

        interaction.createMessage({
            embeds: [{
                color: await userBonusIsActive(interaction.member.id) ? EMBED_SUCCESS_BONUS_COLOR : EMBED_SUCCESS_COLOR,
                author: interaction.member ? {
                    name: interaction.member.username,
                    icon_url: interaction.member.avatarURL,
                } : null,
                title: bold("Song Bookmarked"),
                description: `You'll receive a direct message with a link to ${bold(song.originalSongName)} at the end of the game.`,
                thumbnail: { url: KmqImages.THUMBS_UP },
            }],
            flags: 64,
        });

        gameSession.addBookmarkedSong(interaction.member?.id, song);
    }
}
