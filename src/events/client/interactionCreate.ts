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
import State from "../../state";

const logger = new IPCLogger("interactionCreate");

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

    const session = Session.getSession(interaction.guildID);

    if (interaction instanceof Eris.ComponentInteraction) {
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
                State.client.commands[interaction.data.name];

            if (chatInputInteractionHandler.processChatInputInteraction) {
                if (chatInputInteractionHandler.preRunChecks) {
                    for (const precheck of chatInputInteractionHandler.preRunChecks) {
                        if (
                            // eslint-disable-next-line no-await-in-loop
                            !(await precheck.checkFn({
                                messageContext,
                                session,
                                errorMessage: precheck.errorMessage,
                                interaction,
                            }))
                        ) {
                            return;
                        }
                    }
                }

                await chatInputInteractionHandler.processChatInputInteraction(
                    interaction,
                    messageContext
                );
            }

            return;
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
                ProfileCommand.handleProfileInteraction(
                    interaction as Eris.CommandInteraction,
                    interaction.data.target_id,
                    true
                );
            } else if (
                interaction.data.type ===
                Eris.Constants.ApplicationCommandTypes.MESSAGE
            ) {
                const messageID = interaction.data.target_id;
                const authorID = (
                    interaction as Eris.CommandInteraction
                ).data.resolved["messages"].get(messageID).author.id;

                ProfileCommand.handleProfileInteraction(
                    interaction,
                    authorID,
                    true
                );
            }

            break;
        }

        case BOOKMARK_COMMAND_NAME: {
            if (!session) {
                tryCreateInteractionErrorAcknowledgement(
                    interaction as Eris.CommandInteraction,
                    null,
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
