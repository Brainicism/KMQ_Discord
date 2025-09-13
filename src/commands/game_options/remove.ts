import { EMBED_ERROR_COLOR, KmqImages } from "../../constants.js";
import { IPCLogger } from "../../logger.js";
import {
    clickableSlashCommand,
    generateOptionsMessage,
    getDebugLogHeader,
    notifyOptionsGenerationError,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils.js";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import GameOption from "../../enums/game_option_name.js";
import GuildPreference from "../../structures/guild_preference.js";
import MessageContext from "../../structures/message_context.js";
import Session from "../../structures/session.js";
import State from "../../state.js";
import i18n from "../../helpers/localization_manager.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type EmbedPayload from "../../interfaces/embed_payload.js";
import type Eris from "eris";
import type MatchedArtist from "../../interfaces/matched_artist.js";

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

        let gameOption: GameOption;
        switch (removeType) {
            case RemoveType.GROUPS:
            case RemoveType.GROUP:
            case RemoveType.ARTIST:
            case RemoveType.ARTISTS:
                gameOption = GameOption.GROUPS;
                await guildPreference.setGroups(remainingGroups);
                break;
            case RemoveType.INCLUDE:
            case RemoveType.INCLUDES:
                gameOption = GameOption.INCLUDE;
                await guildPreference.setIncludes(remainingGroups);
                break;
            case RemoveType.EXCLUDE:
            case RemoveType.EXCLUDES:
                gameOption = GameOption.EXCLUDE;
                await guildPreference.setExcludes(remainingGroups);
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
