import Eris from "eris";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import { getUserTag, EMBED_ERROR_COLOR, EMBED_SUCCESS_COLOR, EMBED_SUCCESS_BONUS_COLOR, getCurrentVoiceMembers } from "../../helpers/discord_utils";
import { state } from "../../kmq";
import { getGuildPreference, userBonusIsActive } from "../../helpers/game_utils";
import { GuessModeType } from "../../commands/game_options/guessmode";
import { bold } from "../../helpers/utils";
import { KmqImages } from "../../constants";
import { BOOKMARK_MESSAGE_SIZE } from "../../structures/game_session";

const logger = new IPCLogger("interactionCreate");

const MAX_INTERACTION_RESPONSE_TIME = 3 * 1000;

const getDebugLogHeader = ((interaction: Eris.ComponentInteraction | Eris.CommandInteraction) => `gid: ${interaction.guildID}, uid: ${interaction.user?.id}`);

const withinInteractionInterval = ((interaction: Eris.ComponentInteraction | Eris.CommandInteraction) => new Date().getTime() - interaction.createdAt <= MAX_INTERACTION_RESPONSE_TIME);

const tryAcknowledge = (async (interaction: Eris.ComponentInteraction | Eris.CommandInteraction) => {
    if (withinInteractionInterval(interaction)) {
        try {
            await interaction.acknowledge();
        } catch (err) {
            logger.error(`${getDebugLogHeader(interaction)} | Interaction acknowledge failed. err = ${err.stack}`);
        }
    }
});

const tryCreateSuccessMessage = (async (interaction: Eris.ComponentInteraction | Eris.CommandInteraction, title: string, description: string) => {
    try {
        await interaction.createMessage({
            embeds: [{
                color: await userBonusIsActive(interaction.member?.id) ? EMBED_SUCCESS_BONUS_COLOR : EMBED_SUCCESS_COLOR,
                author: {
                    name: interaction.member?.username,
                    icon_url: interaction.member?.avatarURL,
                },
                title: bold(title),
                description,
                thumbnail: { url: KmqImages.THUMBS_UP },
            }],
            flags: 64,
        });
    } catch (err) {
        logger.error(`${getDebugLogHeader(interaction)} | Interaction acknowledge (success message) via createMessage failed. err = ${err.stack}`);
    }
});

const tryCreateErrorMessage = (async (interaction: Eris.ComponentInteraction | Eris.CommandInteraction, description: string) => {
    try {
        await interaction.createMessage({
            embeds: [{
                color: EMBED_ERROR_COLOR,
                author: {
                    name: interaction.member?.username,
                    icon_url: interaction.member?.avatarURL,
                },
                title: bold("Uh-oh"),
                description,
                thumbnail: { url: KmqImages.DEAD },
            }],
            flags: 64,
        });
    } catch (err) {
        logger.error(`${getDebugLogHeader(interaction)} | Interaction acknowledge (failure message) via createMessage failed. err = ${err.stack}`);
    }
});

export default async function interactionCreateHandler(interaction: Eris.PingInteraction | Eris.CommandInteraction | Eris.ComponentInteraction | Eris.UnknownInteraction) {
    if (interaction instanceof Eris.ComponentInteraction) {
        // Multiple choice
        const gameSession = state.gameSessions[interaction.guildID];
        if (!gameSession || !gameSession.gameRound) {
            await tryAcknowledge(interaction);
            return;
        }

        const messageContext = new MessageContext(
            interaction.channelID,
            new KmqMember(interaction.member.username, getUserTag(interaction.member), interaction.member.avatarURL, interaction.member.id),
            interaction.guildID,
        );

        if (!getCurrentVoiceMembers(gameSession.voiceChannelID).map((x) => x.id).includes(interaction.member.id)) {
            await tryAcknowledge(interaction);
            return;
        }

        if (gameSession.gameRound.incorrectMCGuessers.has(interaction.member.id) && withinInteractionInterval(interaction)) {
            await tryCreateErrorMessage(interaction, "You've already been eliminated this round.");
            return;
        }

        if (!gameSession.gameRound.isValidInteractionGuess(interaction.data.custom_id) && withinInteractionInterval(interaction)) {
            await tryCreateErrorMessage(interaction, "You are attempting to pick an option from an already completed round.");
            return;
        }

        if (!gameSession.gameRound.isCorrectInteractionAnswer(interaction.data.custom_id)) {
            if (withinInteractionInterval(interaction)) {
                await tryCreateErrorMessage(interaction, "You've been eliminated this round.");
            }

            if (!gameSession.gameRound) {
                return;
            }

            gameSession.gameRound.incorrectMCGuessers.add(interaction.member.id);
            gameSession.gameRound.interactionIncorrectAnswerUUIDs[interaction.data.custom_id]++;

            // Add the user as a participant
            await gameSession.guessSong(messageContext, "");
            return;
        }

        await tryAcknowledge(interaction);

        const guildPreference = await getGuildPreference(messageContext.guildID);
        if (!gameSession.gameRound) return;
        await gameSession.guessSong(messageContext, guildPreference.gameOptions.guessModeType !== GuessModeType.ARTIST ? gameSession.gameRound.songName : gameSession.gameRound.artistName);
    } else if (interaction instanceof Eris.CommandInteraction) {
        // Bookmarking songs
        const gameSession = state.gameSessions[interaction.guildID];
        const song = gameSession?.getSongFromMessageID(interaction.data.target_id);
        if ((!gameSession || !song) && withinInteractionInterval(interaction)) {
            await tryCreateErrorMessage(interaction, !gameSession ? "You can only bookmark songs during a game." : `You can only bookmark songs recently played in the last ${BOOKMARK_MESSAGE_SIZE} rounds. You must bookmark the message sent by the bot containing the song.`);
            return;
        }

        if (withinInteractionInterval(interaction)) {
            await tryCreateSuccessMessage(interaction, "Song Bookmarked", `You'll receive a direct message with a link to ${bold(song.originalSongName)} at the end of the game.`);
        }

        gameSession.addBookmarkedSong(interaction.member?.id, song);
    }
}
