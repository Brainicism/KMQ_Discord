import {
    EMBED_ERROR_COLOR,
    GroupAction,
    KmqImages,
    OptionAction,
} from "../../constants.js";
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
import { setIntersection } from "../../helpers/utils.js";
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

const COMMAND_NAME = "add";
const logger = new IPCLogger(COMMAND_NAME);

export enum AddType {
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

export default class AddCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 2,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(AddType),
            },
        ],
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const newGroupNames = parsedMessage.argument
            .split(" ")
            .slice(1)
            .join(" ")
            .split(",")
            .map((groupName) => groupName.trim());

        const addType = parsedMessage.components[0] as AddType;
        await AddCommand.updateOption(
            MessageContext.fromMessage(message),
            addType,
            newGroupNames,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        addType: AddType,
        newGroupNames: Array<string>,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const embeds: Array<EmbedPayload> = [];

        let currentMatchedArtists: MatchedArtist[] | null;
        switch (addType) {
            case AddType.GROUPS:
            case AddType.GROUP:
            case AddType.ARTIST:
            case AddType.ARTISTS:
                currentMatchedArtists = guildPreference.gameOptions.groups;
                break;
            case AddType.INCLUDE:
            case AddType.INCLUDES:
                currentMatchedArtists = guildPreference.gameOptions.includes;

                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES:
                currentMatchedArtists = guildPreference.gameOptions.excludes;

                break;
            default:
                logger.error(`Unexpected addType: ${addType}`);
                currentMatchedArtists = guildPreference.gameOptions.groups;
                break;
        }

        const currentGroupNames = !currentMatchedArtists
            ? []
            : currentMatchedArtists.map((x) => x.name);

        const groups = await getMatchingGroupNames(
            State.aliases.artist,
            currentGroupNames.concat(newGroupNames),
        );

        let { matchedGroups } = groups;
        const { unmatchedGroups } = groups;
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
                        "misc.failure.unrecognizedGroups.added",
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
                description: `${descriptionText}\n\n${suggestionsText ?? ""}`,
                thumbnailUrl: KmqImages.DEAD,
            });
        }

        // if none of the new groups were matched
        if (unmatchedGroups.length === newGroupNames.length) {
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

        let gameOption: GameOption;
        switch (addType) {
            case AddType.GROUPS:
            case AddType.GROUP:
            case AddType.ARTIST:
            case AddType.ARTISTS: {
                gameOption = GameOption.GROUPS;
                const intersection = setIntersection(
                    matchedGroups.map((x) => x.name),
                    guildPreference.getExcludesGroupNames(),
                );

                matchedGroups = matchedGroups.filter(
                    (x) => !intersection.has(x.name),
                );
                if (intersection.size > 0) {
                    embeds.push({
                        color: EMBED_ERROR_COLOR,
                        author: messageContext.author,
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.description",
                            {
                                conflictingOptionOne:
                                    clickableSlashCommand("groups"),
                                conflictingOptionTwo:
                                    clickableSlashCommand("exclude"),
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: clickableSlashCommand(
                                    "exclude",
                                    GroupAction.REMOVE,
                                ),
                                solutionStepTwo: clickableSlashCommand(
                                    "groups",
                                    GroupAction.ADD,
                                ),
                                allowOrPrevent: i18n.translate(
                                    messageContext.guildID,
                                    "misc.failure.groupsExcludeConflict.allow",
                                ),
                            },
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    });
                }

                if (matchedGroups.length === 0) {
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

                await guildPreference.setGroups(matchedGroups);
                break;
            }

            case AddType.INCLUDE:
            case AddType.INCLUDES:
                gameOption = GameOption.INCLUDE;
                if (guildPreference.isGroupsMode()) {
                    logger.warn(
                        `${getDebugLogHeader(
                            messageContext,
                        )} | Game option conflict between include and groups.`,
                    );

                    await sendErrorMessage(
                        messageContext,
                        {
                            title: i18n.translate(
                                messageContext.guildID,
                                "misc.failure.gameOptionConflict.title",
                            ),
                            description: i18n.translate(
                                messageContext.guildID,
                                "misc.failure.gameOptionConflict.description",
                                {
                                    optionOne: clickableSlashCommand("groups"),
                                    optionTwo: clickableSlashCommand("include"),
                                    optionOneCommand: clickableSlashCommand(
                                        "groups",
                                        OptionAction.RESET,
                                    ),
                                },
                            ),
                        },
                        interaction,
                    );

                    return;
                }

                await guildPreference.setIncludes(matchedGroups);
                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES: {
                gameOption = GameOption.EXCLUDE;
                const intersection = setIntersection(
                    matchedGroups.map((x) => x.name),
                    guildPreference.getGroupNames(),
                );

                matchedGroups = matchedGroups.filter(
                    (x) => !intersection.has(x.name),
                );
                if (intersection.size > 0) {
                    embeds.push({
                        color: EMBED_ERROR_COLOR,
                        author: messageContext.author,
                        title: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "misc.failure.groupsExcludeConflict.description",
                            {
                                conflictingOptionOne:
                                    clickableSlashCommand("exclude"),
                                conflictingOptionTwo:
                                    clickableSlashCommand("groups"),
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: clickableSlashCommand(
                                    "groups",
                                    GroupAction.REMOVE,
                                ),
                                solutionStepTwo: clickableSlashCommand(
                                    "exclude",
                                    GroupAction.ADD,
                                ),
                                allowOrPrevent: i18n.translate(
                                    messageContext.guildID,
                                    "misc.failure.groupsExcludeConflict.prevent",
                                ),
                            },
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    });
                }

                if (matchedGroups.length === 0) {
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

                await guildPreference.setExcludes(matchedGroups);
                break;
            }

            default:
                logger.error(`Unexpected addType: ${addType}`);
                return;
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | ${gameOption} added: ${guildPreference.getDisplayedGroupNames()}`,
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
            await notifyOptionsGenerationError(messageContext, "add");
        }
    }
}
