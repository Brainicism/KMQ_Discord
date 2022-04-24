import Eris from "eris";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import {
    getUserTag,
    tryInteractionAcknowledge,
    tryCreateInteractionErrorAcknowledgement,
} from "../../helpers/discord_utils";
import { handleProfileInteraction } from "../../commands/game_commands/profile";
import Session from "../../structures/session";
import LocalizationManager from "../../helpers/localization_manager";
import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";

/**
 * Handles the 'interactionCreate' event
 * @param interaction - The originating Interaction
 */
export default async function interactionCreateHandler(
    interaction:
        | Eris.PingInteraction
        | Eris.CommandInteraction
        | Eris.ComponentInteraction
        | Eris.UnknownInteraction
): Promise<void> {
    if (interaction instanceof Eris.ComponentInteraction) {
        const session = Session.getSession(interaction.guildID);
        if (
            !session ||
            (!session.round && interaction.data.custom_id !== "bookmark")
        ) {
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

        await session.handleComponentInteraction(interaction, messageContext);
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
                const session = Session.getSession(interaction.guildID);
                if (!session) {
                    tryCreateInteractionErrorAcknowledgement(
                        interaction,
                        LocalizationManager.localizer.translate(
                            interaction.guildID,
                            "misc.failure.interaction.bookmarkOutsideGame"
                        )
                    );
                    return;
                }

                session.handleBookmarkInteraction(interaction);
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
