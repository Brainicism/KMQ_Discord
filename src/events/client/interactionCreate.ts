import Eris from "eris";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import {
    getUserTag,
    tryInteractionAcknowledge,
    tryCreateInteractionErrorAcknowledgement,
} from "../../helpers/discord_utils";
import { state } from "../../kmq_worker";
import { handleProfileInteraction } from "../../commands/game_commands/profile";

export const BOOKMARK_COMMAND_NAME = "Bookmark Song";
export const PROFILE_COMMAND_NAME = "Profile";

/**
 * Handles the 'interactionCreate' event
 * @param interaction - The originating Interaction
 */
export default function interactionCreateHandler(
    interaction:
        | Eris.PingInteraction
        | Eris.CommandInteraction
        | Eris.ComponentInteraction
        | Eris.UnknownInteraction
): Promise<void> {
    if (interaction instanceof Eris.ComponentInteraction) {
        const gameSession = state.gameSessions[interaction.guildID];
        if (!gameSession || !gameSession.round) {
            tryInteractionAcknowledge(interaction);
            return;
        }

        const messageContext = new MessageContext(
            interaction.channel.id,
            new KmqMember(
                interaction.member.username,
                getUserTag(interaction.member),
                interaction.member.avatarURL,
                interaction.member.id
            ),
            interaction.guildID
        );

        gameSession.handleMultipleChoiceInteraction(
            interaction,
            messageContext
        );
    } else if (interaction instanceof Eris.CommandInteraction) {
        if (
            interaction.data.type ===
            Eris.Constants.ApplicationCommandTypes.USER
        ) {
            if (interaction.data.name === PROFILE_COMMAND_NAME) {
                handleProfileInteraction(
                    interaction,
                    interaction.data.target_id
                );
            }
        } else if (
            interaction.data.type ===
            Eris.Constants.ApplicationCommandTypes.MESSAGE
        ) {
            if (interaction.data.name === BOOKMARK_COMMAND_NAME) {
                const gameSession = state.gameSessions[interaction.guildID];
                if (!gameSession) {
                    tryCreateInteractionErrorAcknowledgement(
                        interaction,
                        state.localizer.translate(
                            interaction.guildID,
                            "misc.failure.interaction.bookmarkOutsideGame"
                        )
                    );
                    return;
                }

                gameSession.handleBookmarkInteraction(interaction);
            } else if (interaction.data.name === PROFILE_COMMAND_NAME) {
                const messageId = interaction.data.target_id;
                const authorId =
                    interaction.data.resolved["messages"].get(messageId).author
                        .id;

                handleProfileInteraction(interaction, authorId);
            }
        }
    }
}
