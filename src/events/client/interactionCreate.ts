import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import { handleProfileInteraction } from "../../commands/game_commands/profile";
import {
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GroupsCommand from "../../commands/game_options/groups";
import KmqMember from "../../structures/kmq_member";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import ReleaseCommand from "../../commands/game_options/release";
import Session from "../../structures/session";
import StatsCommand from "../../commands/admin/stats";

const logger = new IPCLogger("interactionCreate");

const CHAT_INPUT_COMMAND_INTERACTION_HANDLERS: {
    [command: string]: (
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ) => Promise<void>;
} = {
    groups: GroupsCommand.processChatInputInteraction,
    release: ReleaseCommand.processChatInputInteraction,
    stats: StatsCommand.processChatInputInteraction,
};

const AUTO_COMPLETE_COMMAND_INTERACTION_HANDLERS: {
    [command: string]: (
        interaction: Eris.AutocompleteInteraction
    ) => Promise<void>;
} = {
    groups: GroupsCommand.processAutocompleteInteraction,
};

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
        if (
            interaction.data.type ===
            Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
        ) {
            logger.info(
                `CHAT_INPUT CommandInteraction received for '${interaction.data.name}'`
            );
            const chatInputInteractionHandler =
                CHAT_INPUT_COMMAND_INTERACTION_HANDLERS[interaction.data.name];

            if (chatInputInteractionHandler) {
                await chatInputInteractionHandler(interaction, messageContext);
                return;
            }
        }
    } else if (interaction instanceof Eris.AutocompleteInteraction) {
        const autocompleteInteractionHandler =
            AUTO_COMPLETE_COMMAND_INTERACTION_HANDLERS[interaction.data.name];

        if (autocompleteInteractionHandler) {
            await autocompleteInteractionHandler(interaction);
            return;
        }
    }

    switch (interaction.data.name) {
        case PROFILE_COMMAND_NAME: {
            interaction = interaction as Eris.CommandInteraction;
            if (
                interaction.data.type ===
                Eris.Constants.ApplicationCommandTypes.USER
            ) {
                handleProfileInteraction(
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

                handleProfileInteraction(interaction, authorID);
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
