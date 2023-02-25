import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getInteractionValue,
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import { measureExecutionTime } from "../../helpers/utils";
import Eris from "eris";
import ExcludeCommand from "../../commands/game_options/exclude";
import FeedbackCommand from "../../commands/game_commands/feedback";
import GroupsCommand from "../../commands/game_options/groups";
import HelpCommand from "../../commands/game_commands/help";
import IncludeCommand from "../../commands/game_options/include";
import KmqMember from "../../structures/kmq_member";
import LookupCommand from "../../commands/game_commands/lookup";
import MessageContext from "../../structures/message_context";
import PresetCommand from "../../commands/game_commands/preset";
import ProfileCommand from "../../commands/game_commands/profile";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";

const logger = new IPCLogger("interactionCreate");

const AUTO_COMPLETE_COMMAND_INTERACTION_HANDLERS: {
    [command: string]: (
        interaction: Eris.AutocompleteInteraction
    ) => Promise<void>;
} = {
    groups: GroupsCommand.processAutocompleteInteraction,
    include: IncludeCommand.processAutocompleteInteraction,
    exclude: ExcludeCommand.processAutocompleteInteraction,
    lookup: LookupCommand.processAutocompleteInteraction,
    preset: PresetCommand.processAutocompleteInteraction,
    help: HelpCommand.processAutocompleteInteraction,
};

const MODAL_SUBMIT_INTERACTION_HANDLERS: {
    [command: string]: (
        interaction: Eris.ModalSubmitInteraction
    ) => Promise<void>;
} = {
    feedback: FeedbackCommand.processModalSubmitInteraction,
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
        | Eris.ModalSubmitInteraction
): Promise<void> {
    const member = new KmqMember(interaction.member!.id);
    const messageContext = new MessageContext(
        interaction.channel.id,
        member,
        interaction.guildID as string
    );

    const session = Session.getSession(interaction.guildID as string);
    let interactionPromise: Promise<any> | null = null;
    let interactionName: string | null = null;
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
                                interaction.data.target_id as string,
                                true
                            );
                    } else if (
                        interaction.data.type ===
                        Eris.Constants.ApplicationCommandTypes.MESSAGE
                    ) {
                        const messageID = interaction.data.target_id;
                        const authorID = (
                            interaction as Eris.CommandInteraction
                        ).data.resolved!["messages"]!.get(messageID as string)!
                            .author.id;

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
                            i18n.translate(
                                interaction.guildID as string,
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

        const parsedInteraction = getInteractionValue(interaction);
        if (autocompleteInteractionHandler) {
            interactionName = `Autocomplete interaction for '${interaction.data.name}' for value '${parsedInteraction.focusedKey}'`;
            interactionPromise = autocompleteInteractionHandler(interaction);
        } else {
            logger.error(
                `No handler for for AutocompleteInteraction (type = ${interaction.data.type}): ${interaction.data.name}`
            );
        }
    } else if (interaction instanceof Eris.ModalSubmitInteraction) {
        interactionName = `ModalSubmit interaction for ${interaction.data.custom_id}`;
        const modalSubmitInteractionHandler =
            MODAL_SUBMIT_INTERACTION_HANDLERS[interaction.data.custom_id];

        if (modalSubmitInteractionHandler) {
            interactionPromise = modalSubmitInteractionHandler(interaction);
        } else {
            logger.error(
                `No handler for for ModalSubmitInteraction (custom_id = ${interaction.data.custom_id})`
            );
        }
    }

    if (interactionPromise === null) {
        return;
    }

    const executionTime = await measureExecutionTime(interactionPromise);
    logger.info(`${interactionName} took ${executionTime}ms`);
}
