import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
    tryAutocompleteInteractionAcknowledge,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import { handleProfileInteraction } from "../../commands/game_commands/profile";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import _ from "lodash";
import type MatchedArtist from "../../interfaces/matched_artist";

const logger = new IPCLogger("interactionCreate");

/**
 * Handles setting the groups for the final groups slash command state
 * @param interaction - The completed groups interaction
 * @param messageContext - The source of the interaction
 */
async function processGroupsChatInputInteraction(
    interaction: Eris.CommandInteraction,
    messageContext: MessageContext
): Promise<void> {
    if (interaction instanceof Eris.CommandInteraction) {
        if (
            interaction.data.type ===
            Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
        ) {
            logger.info(
                `${getDebugLogHeader(interaction)} | ${
                    interaction.data.name
                } slash command received`
            );

            const groups: Array<MatchedArtist> = _.uniqBy(
                interaction.data.options.map(
                    (x) => JSON.parse(x["value"]) as MatchedArtist
                ),
                "id"
            );

            const guildPreference = await GuildPreference.getGuildPreference(
                interaction.guildID
            );

            await guildPreference.setGroups(groups);
            tryCreateInteractionSuccessAcknowledgement(
                interaction,
                LocalizationManager.localizer.translate(
                    interaction.guildID,
                    "command.groups.interaction.groupsUpdated.title"
                ),
                LocalizationManager.localizer.translate(
                    interaction.guildID,
                    "command.groups.interaction.groupsUpdated.description"
                )
            );

            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.GROUPS, reset: false }]
            );
        }
    }
}

/**
 * Handles showing suggested artists as the user types for the groups slash command
 * @param interaction - The interaction with intermediate typing state
 */
function processGroupsAutocompleteInteraction(
    interaction: Eris.AutocompleteInteraction
): void {
    const userInput = interaction.data.options.filter((x) => x["focused"])[0][
        "value"
    ] as string;

    const artistEntryToInteraction = (
        x: MatchedArtist
    ): { name: string; value: string } => ({
        name: x.name,
        value: JSON.stringify(x),
    });

    if (userInput === "") {
        tryAutocompleteInteractionAcknowledge(
            interaction,
            State.topArtists.map((x) => artistEntryToInteraction(x))
        );

        return;
    }

    const matchingGroups = Object.entries(State.artistToEntry)
        .filter((x) => x[0].toLowerCase().startsWith(userInput.toLowerCase()))
        .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
        .slice(0, 25);

    tryAutocompleteInteractionAcknowledge(
        interaction,
        matchingGroups.map((x) => artistEntryToInteraction(x[1]))
    );
}

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

    switch (interaction.data.name) {
        case "groups": {
            if (interaction instanceof Eris.CommandInteraction) {
                await processGroupsChatInputInteraction(
                    interaction,
                    messageContext
                );
            } else if (interaction instanceof Eris.AutocompleteInteraction) {
                processGroupsAutocompleteInteraction(interaction);
            }

            break;
        }

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
