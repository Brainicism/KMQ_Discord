import { EMBED_ERROR_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    clickableSlashCommand,
    generateOptionsMessage,
    getDebugLogHeader,
    notifyOptionsGenerationError,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type Eris from "eris";
import type MatchedArtist from "../../interfaces/matched_artist";

const COMMAND_NAME = "remove";
const logger = new IPCLogger(COMMAND_NAME);

export enum RemoveType {
    // Groups with aliases
    GROUPS = "groups",
    GROUP = "group",
    ARTIST = "artist",
    ARTISTS = "artists",

    // Exclude with aliases
    EXCLUDE = "exclude",
    EXCLUDES = "excludes",

    // Include with aliases
    INCLUDE = "include",
    INCLUDES = "includes",
}

export default class RemoveCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 2,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(RemoveType),
            },
        ],
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const rawGroupsToRemove = parsedMessage.argument
            .split(" ")
            .slice(1)
            .join(" ")
            .split(",")
            .map((groupName) => groupName.trim().toLowerCase());

        const removeType = parsedMessage.components[0] as RemoveType;

        await RemoveCommand.updateOption(
            MessageContext.fromMessage(message),
            removeType,
            rawGroupsToRemove,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        removeType: RemoveType,
        rawGroupsToRemove: Array<string>,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        let currentMatchedArtists: MatchedArtist[] | null;
        switch (removeType) {
            case RemoveType.GROUPS:
            case RemoveType.GROUP:
            case RemoveType.ARTIST:
            case RemoveType.ARTISTS:
                currentMatchedArtists = guildPreference.gameOptions.groups;
                break;
            case RemoveType.INCLUDE:
            case RemoveType.INCLUDES:
                currentMatchedArtists = guildPreference.gameOptions.includes;
                break;
            case RemoveType.EXCLUDE:
            case RemoveType.EXCLUDES:
                currentMatchedArtists = guildPreference.gameOptions.excludes;
                break;
            default:
                logger.error(`Unexpected removeType: ${removeType}`);
                currentMatchedArtists = [];
        }

        if (!currentMatchedArtists) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.remove.failure.noGroupsSelected.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.remove.failure.noGroupsSelected.description",
                    ),
                },
                interaction,
            );
            return;
        }

        currentMatchedArtists = currentMatchedArtists.filter((groups) =>
            groups.added_by_user.includes("y"),
        );

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            State.aliases.artist,
            rawGroupsToRemove,
        );

        const embeds: Array<EmbedPayload> = [];

        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Attempted to set unknown groups. groups = ${unmatchedGroups.join(
                    ", ",
                )}`,
            );

            let suggestionsText: string | undefined;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    unmatchedGroups[0]!,
                    State.getGuildLocale(messageContext.guildID),
                );

                if (suggestions.length > 0) {
                    suggestionsText = i18n.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.didYouMean",
                        {
                            suggestions: suggestions.join("\n"),
                        },
                    );
                }
            }

            const descriptionText = i18n.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction: i18n.translate(
                        messageContext.guildID,
                        "command.remove.failure.unrecognizedGroups.removed",
                    ),
                    helpGroups: `${clickableSlashCommand(
                        "help",
                    )} action:groups`,
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: "",
                },
            );

            embeds.push({
                color: EMBED_ERROR_COLOR,
                author: messageContext.author,
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.unrecognizedGroups.title",
                ),
                description: `${descriptionText}\n\n${suggestionsText || ""}`,
                thumbnailUrl: KmqImages.DEAD,
            });
        }

        // if none of the new groups were matched
        if (unmatchedGroups.length === rawGroupsToRemove.length) {
            if (embeds.length > 0) {
                await sendInfoMessage(
                    messageContext,
                    embeds[0]!,
                    false,
                    undefined,
                    embeds.slice(1),
                    interaction,
                );
            }

            return;
        }

        const remainingGroups = currentMatchedArtists.filter(
            (group) => !matchedGroups.some((x) => x.id === group.id),
        );
        const groups = await getMatchingGroupNames(
            State.aliases.artist,
            remainingGroups.map((x) => x.name),
        ); // This should not have any unmatched groups right?

        let gameOption: GameOption;
        switch (removeType) {
            case RemoveType.GROUPS:
            case RemoveType.GROUP:
            case RemoveType.ARTIST:
            case RemoveType.ARTISTS:
                gameOption = GameOption.GROUPS;
                await guildPreference.setGroups(groups.matchedGroups);
                break;
            case RemoveType.INCLUDE:
            case RemoveType.INCLUDES:
                gameOption = GameOption.INCLUDE;
                await guildPreference.setIncludes(groups.matchedGroups);
                break;
            case RemoveType.EXCLUDE:
            case RemoveType.EXCLUDES:
                gameOption = GameOption.EXCLUDE;
                await guildPreference.setExcludes(groups.matchedGroups);
                break;
            default:
                logger.error(`Unexpected removeType: ${removeType}`);
                return;
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | ${gameOption} removed: ${rawGroupsToRemove}`,
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: gameOption, reset: false }],
            false,
            undefined,
            undefined,
        );

        if (optionsMessage) {
            await sendInfoMessage(
                messageContext,
                optionsMessage,
                true,
                undefined,
                embeds,
                interaction,
            );
        } else {
            await notifyOptionsGenerationError(messageContext, "remove");
        }
    }
}
