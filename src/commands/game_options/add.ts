import { EMBED_ERROR_COLOR, GROUP_LIST_URL, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
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
import { setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("add");

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

    help = (guildID: string): HelpDocumentation => ({
        name: "add",
        description: i18n.translate(guildID, "command.add.help.description", {
            groups: "`/groups`",
            exclude: "`/exclude`",
            include: "`/include`",
        }),
        usage: `/groups add [${i18n.translate(
            guildID,
            "misc.listOfGroups",
        )}]\n\n/include add [${i18n.translate(
            guildID,
            "misc.listOfGroups",
        )}]\n\n/exclude add [${i18n.translate(guildID, "misc.listOfGroups")}]`,
        examples: [
            {
                example: "`/groups add group_1:twice group_2:red velvet`",
                explanation: i18n.translate(
                    guildID,
                    "command.add.help.example.groups",
                    {
                        groupOne: "Twice",
                        groupTwo: "Red Velvet",
                        groups: "`/groups`",
                    },
                ),
            },
            {
                example:
                    "`/exclude add group_1:BESTie group_2:Dia group_3:iKON`",
                explanation: i18n.translate(
                    guildID,
                    "command.add.help.example.exclude",
                    {
                        groupOne: "BESTie",
                        groupTwo: "Dia",
                        groupThree: "IKON",
                        exclude: "`/exclude`",
                    },
                ),
            },
            {
                example: "`/include add group_1:exo`",
                explanation: i18n.translate(
                    guildID,
                    "command.add.help.example.include",
                    {
                        groupOne: "EXO",
                        include: "`/include`",
                    },
                ),
            },
        ],
        actionRowComponents: [
            {
                type: Eris.Constants.ComponentTypes.BUTTON,
                style: Eris.Constants.ButtonStyles.LINK,
                url: GROUP_LIST_URL,
                label: i18n.translate(
                    guildID,
                    "misc.interaction.fullGroupsList",
                ),
            },
        ],
        priority: 200,
    });

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

        let groupNamesString: string | null;
        switch (addType) {
            case AddType.GROUPS:
            case AddType.GROUP:
            case AddType.ARTIST:
            case AddType.ARTISTS:
                groupNamesString = guildPreference.getDisplayedGroupNames(true);
                break;
            case AddType.INCLUDE:
            case AddType.INCLUDES:
                groupNamesString =
                    guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case AddType.EXCLUDE:
            case AddType.EXCLUDES:
                groupNamesString =
                    guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
                logger.error(`Unexpected addType: ${addType}`);
                groupNamesString = guildPreference.getDisplayedGroupNames(true);
                break;
        }

        const currentGroupNames = !groupNamesString
            ? []
            : groupNamesString.split(",");

        const groups = await getMatchingGroupNames(
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
                    unmatchedGroups[0],
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
                    helpGroups: "`/help groups`",
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
                    embeds[0],
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
                                conflictingOptionOne: "`/groups`",
                                conflictingOptionTwo: "`/exclude`",
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: "`/exclude remove`",
                                solutionStepTwo: "`/groups add`",
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
                            embeds[0],
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

                    sendErrorMessage(
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
                                    optionOne: "`groups`",
                                    optionTwo: "`include`",
                                    optionOneCommand: "`/groups reset`",
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
                                conflictingOptionOne: "`/exclude`",
                                conflictingOptionTwo: "`/groups`",
                                groupsList: [...intersection]
                                    .filter((x) => !x.includes("+"))
                                    .join(", "),
                                solutionStepOne: "`/groups remove`",
                                solutionStepTwo: "`/exclude add`",
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
                            embeds[0],
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
