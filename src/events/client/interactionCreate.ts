import * as Eris from "eris";
import * as uuid from "uuid";
import {
    BOOKMARK_BUTTON_PREFIX,
    PROFILE_COMMAND_NAME,
} from "../../constants.js";
import { CommandInteraction } from "eris";
import { IPCLogger } from "../../logger.js";
import { extractErrorString } from "../../helpers/utils.js";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils.js";
import BookmarksCommand from "../../commands/misc_commands/bookmarks.js";
import CommandPrechecks from "../../command_prechecks.js";
import ExcludeCommand from "../../commands/game_options/exclude.js";
import FeedbackCommand from "../../commands/misc_commands/feedback.js";
import GroupsCommand from "../../commands/game_options/groups.js";
import HelpCommand from "../../commands/game_commands/help.js";
import IncludeCommand from "../../commands/game_options/include.js";
import KmqMember from "../../structures/kmq_member.js";
import LocaleType from "../../enums/locale_type.js";
import LookupCommand from "../../commands/misc_commands/lookup.js";
import MessageContext from "../../structures/message_context.js";
import PlayCommand from "../../commands/game_commands/play.js";
import PresetCommand from "../../commands/game_commands/preset.js";
import ProfileCommand from "../../commands/game_commands/profile.js";
import Session from "../../structures/session.js";
import State from "../../state.js";
import i18n from "../../helpers/localization_manager.js";
import type PrecheckArgs from "../../interfaces/precheck_args.js";

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
    bookmarks: BookmarksCommand.processAutocompleteInteraction,
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
            logger.info(
                `${getDebugLogHeader(messageContext)} | Invoked component interaction '${interactionName} (${interaction.id})'.`,
            );

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
                    logger.info(
                        `${getDebugLogHeader(messageContext)} | Invoked chat input interaction '${interactionName} (${interaction.id})'.`,
                    );

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
                            logger.info(
                                `${getDebugLogHeader(messageContext)} | Invoked user application command interaction '${interactionName} (${interaction.id})'.`,
                            );

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
                            logger.info(
                                `${getDebugLogHeader(messageContext)} | Invoked message application command interaction '${interactionName} (${interaction.id})'.`,
                            );

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
                interactionName = `Autocomplete interaction for '${interaction.data.name}' (${interaction.id}) for value '${parsedInteraction.focusedKey}'`;
                await autocompleteInteractionHandler(interaction);
            } else {
                logger.error(
                    `No handler for for AutocompleteInteraction (type = ${interaction.data.type}): ${interaction.data.name}`,
                );
            }
        } else if (interaction instanceof Eris.ModalSubmitInteraction) {
            interactionName = `ModalSubmit interaction for ${interaction.data.custom_id} (${interaction.id})`;
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
            )} | Error while invoking command (${interactionName})| id = ${interaction.id} | ${debugId} |  Data: ${JSON.stringify(interaction.data)} | ${extractErrorString(err)}.`,
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
        logger.info(
            `${interactionName} (${interaction.id}) took ${executionTime}ms`,
        );
    }
}
