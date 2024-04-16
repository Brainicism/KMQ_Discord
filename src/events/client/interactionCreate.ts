import * as uuid from "uuid";
import { BOOKMARK_BUTTON_PREFIX, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris, { CommandInteraction } from "eris";
import ExcludeCommand from "../../commands/game_options/exclude";
import FeedbackCommand from "../../commands/misc_commands/feedback";
import GroupsCommand from "../../commands/game_options/groups";
import HelpCommand from "../../commands/game_commands/help";
import IncludeCommand from "../../commands/game_options/include";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import LookupCommand from "../../commands/game_commands/lookup";
import MessageContext from "../../structures/message_context";
import PlayCommand from "../../commands/game_commands/play";
import PresetCommand from "../../commands/game_commands/preset";
import ProfileCommand from "../../commands/game_commands/profile";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type PrecheckArgs from "../../interfaces/precheck_args";

const logger = new IPCLogger("interactionCreate");

const AUTO_COMPLETE_COMMAND_INTERACTION_HANDLERS: {
    [command: string]: (
        interaction: Eris.AutocompleteInteraction,
    ) => Promise<void>;
} = {
    groups: GroupsCommand.processAutocompleteInteraction,
    include: IncludeCommand.processAutocompleteInteraction,
    exclude: ExcludeCommand.processAutocompleteInteraction,
    lookup: LookupCommand.processAutocompleteInteraction,
    preset: PresetCommand.processAutocompleteInteraction,
    help: HelpCommand.processAutocompleteInteraction,
    play: PlayCommand.processAutocompleteInteraction,
};

const MODAL_SUBMIT_INTERACTION_HANDLERS: {
    [command: string]: (
        interaction: Eris.ModalSubmitInteraction,
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
        | Eris.ModalSubmitInteraction,
): Promise<void> {
    const hrstart = process.hrtime();
    if (!interaction.guildID) {
        if (
            interaction instanceof Eris.ComponentInteraction ||
            interaction instanceof Eris.CommandInteraction
        ) {
            await tryCreateInteractionErrorAcknowledgement(
                interaction,
                i18n.translate(LocaleType.EN, "misc.interaction.title.failure"),
                i18n.translate(
                    LocaleType.EN,
                    "misc.failure.interaction.guildOnly",
                ),
            );
        }

        return;
    }

    if (State.bannedServers.has(interaction.guildID)) {
        logger.warn(
            `Banned server attempted to execute interaction. id = ${interaction.guildID}`,
        );

        if (
            interaction instanceof Eris.ComponentInteraction ||
            interaction instanceof Eris.CommandInteraction
        ) {
            await tryCreateInteractionErrorAcknowledgement(
                interaction,
                i18n.translate(
                    interaction.guildID,
                    "misc.interaction.title.failure",
                ),
                i18n.translate(
                    interaction.guildID,
                    "misc.failure.interaction.guildBanned",
                    {
                        supportServer: "https://discord.gg/RCuzwYV",
                    },
                ),
            );
        }

        return;
    }

    if (State.bannedPlayers.has(interaction.member!.id)) {
        logger.warn(
            `Banned player attempted to execute interaction. id = ${
                interaction.member!.id
            }`,
        );

        if (
            interaction instanceof Eris.ComponentInteraction ||
            interaction instanceof Eris.CommandInteraction
        ) {
            await tryCreateInteractionErrorAcknowledgement(
                interaction,
                i18n.translate(
                    interaction.guildID,
                    "misc.interaction.title.failure",
                ),
                i18n.translate(
                    interaction.guildID,
                    "misc.failure.interaction.playerBanned",
                    {
                        supportServer: "https://discord.gg/RCuzwYV",
                    },
                ),
            );
        }

        return;
    }

    const member = new KmqMember(interaction.member!.id);
    const messageContext = new MessageContext(
        interaction.channel.id,
        member,
        interaction.guildID as string,
    );

    const session = Session.getSession(interaction.guildID as string);
    let interactionName: string | null = null;
    try {
        if (interaction instanceof Eris.ComponentInteraction) {
            if (!session) {
                if (
                    interaction.data.custom_id.startsWith(
                        BOOKMARK_BUTTON_PREFIX,
                    )
                ) {
                    await tryCreateInteractionErrorAcknowledgement(
                        interaction,
                        null,
                        i18n.translate(
                            interaction.guildID as string,
                            "misc.failure.interaction.bookmarkOutsideGame",
                        ),
                    );
                } else {
                    await tryInteractionAcknowledge(interaction);
                }

                return;
            }

            interactionName = `Component interaction for '${interaction.data.custom_id}'`;
            await session.handleComponentInteraction(
                interaction,
                messageContext,
            );
        } else if (interaction instanceof Eris.CommandInteraction) {
            if (
                interaction.data.type ===
                Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
            ) {
                const commandInteractionHandler =
                    State.client.commandsHandlers[interaction.data.name];

                if (commandInteractionHandler?.processChatInputInteraction) {
                    const prechecks: Array<{
                        checkFn: (
                            precheckArgs: PrecheckArgs,
                        ) => boolean | Promise<boolean>;
                        errorMessage?: string;
                    }> = [
                        {
                            checkFn: CommandPrechecks.maintenancePrecheck,
                            errorMessage: undefined,
                        },
                    ];

                    if (commandInteractionHandler.preRunChecks) {
                        prechecks.push(
                            ...commandInteractionHandler.preRunChecks,
                        );
                    }

                    for (const precheck of prechecks) {
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

                    interactionName = `CHAT_INPUT CommandInteraction interaction for '${interaction.data.name}'`;
                    await commandInteractionHandler.processChatInputInteraction(
                        interaction,
                        messageContext,
                    );
                } else {
                    logger.error(
                        `No handler found for CHAT_INPUT CommandInteraction: ${interaction.data.name}`,
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
                            await ProfileCommand.handleProfileInteraction(
                                interaction as Eris.CommandInteraction,
                                interaction.data.target_id as string,
                                true,
                            );
                        } else if (
                            interaction.data.type ===
                            Eris.Constants.ApplicationCommandTypes.MESSAGE
                        ) {
                            const messageID = interaction.data.target_id;
                            const authorID = (
                                interaction as Eris.CommandInteraction
                            ).data.resolved!["messages"]!.get(
                                messageID as string,
                            )!.author.id;

                            interactionName = `MESSAGE Application Command for '${interaction.data.name}'`;

                            await ProfileCommand.handleProfileInteraction(
                                interaction,
                                authorID,
                                true,
                            );
                        }

                        break;
                    }

                    default: {
                        logger.error(
                            `No handler found for CommandInteraction  (type = ${interaction.data.type}): ${interaction.data.name}`,
                        );
                    }
                }
            }
        } else if (interaction instanceof Eris.AutocompleteInteraction) {
            const autocompleteInteractionHandler =
                AUTO_COMPLETE_COMMAND_INTERACTION_HANDLERS[
                    interaction.data.name
                ];

            const parsedInteraction = getInteractionValue(interaction);
            if (autocompleteInteractionHandler) {
                interactionName = `Autocomplete interaction for '${interaction.data.name}' for value '${parsedInteraction.focusedKey}'`;
                await autocompleteInteractionHandler(interaction);
            } else {
                logger.error(
                    `No handler for for AutocompleteInteraction (type = ${interaction.data.type}): ${interaction.data.name}`,
                );
            }
        } else if (interaction instanceof Eris.ModalSubmitInteraction) {
            interactionName = `ModalSubmit interaction for ${interaction.data.custom_id}`;
            const modalSubmitInteractionHandler =
                MODAL_SUBMIT_INTERACTION_HANDLERS[interaction.data.custom_id];

            if (modalSubmitInteractionHandler) {
                await modalSubmitInteractionHandler(interaction);
            } else {
                logger.error(
                    `No handler for for ModalSubmitInteraction (custom_id = ${interaction.data.custom_id})`,
                );
            }
        }
    } catch (err) {
        const debugId = uuid.v4();

        logger.error(
            `${getDebugLogHeader(
                messageContext,
            )} | Error while invoking command (${interactionName}) | ${debugId} |  Data: ${JSON.stringify(interaction.data)} | Exception Name: ${err.name}. Reason: ${
                err.message
            }. Trace: ${err.stack}}.`,
        );

        if (interaction instanceof CommandInteraction) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.command.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.command.description",
                        { debugId },
                    ),
                },
                interaction,
            );
        }
    } finally {
        const hrend = process.hrtime(hrstart);
        const executionTime = hrend[0] * 1000 + hrend[1] / 1000000;
        logger.info(`${interactionName} took ${executionTime}ms`);
    }
}
