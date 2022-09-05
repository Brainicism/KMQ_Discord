import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import { measureExecutionTime } from "../../helpers/utils";
import {
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GroupsCommand from "../../commands/game_options/groups";
import KmqMember from "../../structures/kmq_member";
import LocalizationManager from "../../helpers/localization_manager";
import LookupCommand from "../../commands/game_commands/lookup";
import MessageContext from "../../structures/message_context";
import PresetCommand from "../../commands/game_commands/preset";
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
    lookup: LookupCommand.processAutocompleteInteraction,
    preset: PresetCommand.processAutocompleteInteraction,
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
    let interactionPromise: Promise<any> = null;
    let interactionName: string = null;
    if (interaction instanceof Eris.ComponentInteraction) {
        if (
            !session ||
            (!session.round && interaction.data.custom_id !== "bookmark")
        ) {
            tryInteractionAcknowledge(interaction);
            return;
        }

        interactionName = `Component interaction for '${interaction.data.custom_id}'`;
        interactionPromise = session.handleComponentInteraction(
            interaction,
            messageContext
        );
    } else if (interaction instanceof Eris.CommandInteraction) {
        if (
            interaction.data.type ===
            Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
        ) {
            const commandInteractionHandler =
                State.client.commands[interaction.data.name];

            if (commandInteractionHandler?.processChatInputInteraction) {
                if (commandInteractionHandler.preRunChecks) {
                    for (const precheck of commandInteractionHandler.preRunChecks) {
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

                interactionName = `CHAT_INPUT CommandInteraction interaction for '${interaction.data.name}'`;
                interactionPromise =
                    commandInteractionHandler.processChatInputInteraction(
                        interaction,
                        messageContext
                    );
            } else {
                logger.error(
                    `No handler found for CHAT_INPUT CommandInteraction: ${interaction.data.name}`
                );
            }
        } else {
            switch (interaction.data.name) {
                case PROFILE_COMMAND_NAME: {
                    interaction = interaction as Eris.CommandInteraction;
                    if (
                        interaction.data.type ===
                        Eris.Constants.ApplicationCommandTypes.USER
                    ) {
                        interactionName = `USER Application Command for '${interaction.data.name}'`;
                        interactionPromise =
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

                        interactionName = `MESSAGE Application Command for '${interaction.data.name}'`;

                        interactionPromise =
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

                    interactionName = `Application Command for '${interaction.data.name}'`;
                    interactionPromise = session.handleBookmarkInteraction(
                        interaction as Eris.CommandInteraction
                    );
                    break;
                }

                default: {
                    logger.error(
                        `No handler found for CommandInteraction  (type = ${interaction.data.type}): ${interaction.data.name}`
                    );
                }
            }
        }
    } else if (interaction instanceof Eris.AutocompleteInteraction) {
        const autocompleteInteractionHandler =
            AUTO_COMPLETE_COMMAND_INTERACTION_HANDLERS[interaction.data.name];

        if (autocompleteInteractionHandler) {
            interactionName = `Autocomplete interaction for '${
                interaction.data.name
            }' for value '${
                interaction.data.options.find((x) => x["focused"]).name
            }'`;

            interactionPromise = autocompleteInteractionHandler(interaction);
        }
    }

    const executionTime = await measureExecutionTime(interactionPromise);
    logger.info(` ${interactionName} took ${executionTime}ms`);
}
