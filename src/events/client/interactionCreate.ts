import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GroupsCommand from "../../commands/game_options/groups";
import KmqMember from "../../structures/kmq_member";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import ProfileCommand from "../../commands/game_commands/profile";
import Session from "../../structures/session";

const logger = new IPCLogger("interactionCreate");

/**
 * Handles the 'interactionCreate' event
 * @param interaction - The originating Interaction
 */
export default async function interactionCreateHandler(
    interaction:
        | Eris.CommandInteraction
        | Eris.ComponentInteraction
        | Eris.AutocompleteInteraction
): Promise<void> {
    const messageContext = new MessageContext(
        interaction.channel.id,
        new KmqMember(interaction.member.id),
        interaction.guildID
    );

    if (interaction instanceof Eris.ComponentInteraction) {
        const session = Session.getSession(interaction.guildID);
        if (
            !session ||
            (!session.round && interaction.data.custom_id !== "bookmark")
        ) {
            tryInteractionAcknowledge(interaction);
            return;
        }

        await session.handleComponentInteraction(interaction, messageContext);
        return;
    }

    if (interaction instanceof Eris.CommandInteraction) {
        logger.info(`Interaction received for '${interaction.data.name}'`);
    }

    switch (interaction.data.name) {
        case "groups": {
            if (interaction instanceof Eris.CommandInteraction) {
                await GroupsCommand.processChatInputInteraction(
                    interaction,
                    messageContext
                );
            } else if (interaction instanceof Eris.AutocompleteInteraction) {
                GroupsCommand.processAutocompleteInteraction(interaction);
            }

            break;
        }

        case "profile": {
            if (interaction instanceof Eris.CommandInteraction) {
                await ProfileCommand.processChatInputInteraction(
                    interaction,
                    messageContext
                );
            }

            break;
        }

        case PROFILE_COMMAND_NAME: {
            interaction = interaction as Eris.CommandInteraction;
            if (
                interaction.data.type ===
                Eris.Constants.ApplicationCommandTypes.USER
            ) {
                ProfileCommand.handleProfileInteraction(
                    interaction as Eris.CommandInteraction,
                    interaction.data.target_id
                );
            } else if (
                interaction.data.type ===
                Eris.Constants.ApplicationCommandTypes.MESSAGE
            ) {
                const messageID = interaction.data.target_id;
                const authorID = (
                    interaction as Eris.CommandInteraction
                ).data.resolved["messages"].get(messageID).author.id;

                ProfileCommand.handleProfileInteraction(interaction, authorID);
            }

            break;
        }

        case BOOKMARK_COMMAND_NAME: {
            const session = Session.getSession(interaction.guildID);
            if (!session) {
                tryCreateInteractionErrorAcknowledgement(
                    interaction as Eris.CommandInteraction,
                    LocalizationManager.localizer.translate(
                        interaction.guildID,
                        "misc.failure.interaction.bookmarkOutsideGame"
                    )
                );
                return;
            }

            session.handleBookmarkInteraction(
                interaction as Eris.CommandInteraction
            );
            break;
        }

        default: {
            break;
        }
    }
}
