import { EMBED_ERROR_COLOR, GROUP_LIST_URL, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import {
    getMatchingGroupNames,
    getSimilarGroupNames,
} from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";
import type MatchedArtist from "../../interfaces/matched_artist";

const logger = new IPCLogger("remove");

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

    help = (guildID: string): HelpDocumentation => ({
        name: "remove",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.remove.help.description",
            {
                groups: "`/groups`",
                exclude: "`/exclude`",
                include: "`/include`",
            }
        ),
        usage: `,remove [groups | exclude | include] [${LocalizationManager.localizer.translate(
            guildID,
            "misc.listOfGroups"
        )}]`,
        examples: [
            {
                example: "`,remove groups twice, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.remove.help.example.groups",
                    {
                        groupOne: "Twice",
                        groupTwo: "Red Velvet",
                        groups: "`/groups`",
                    }
                ),
            },
            {
                example: "`,remove exclude BESTie, Dia, iKON`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.remove.help.example.exclude",
                    {
                        groupOne: "BESTie",
                        groupTwo: "Dia",
                        groupThree: "iKON",
                        exclude: "`/exclude`",
                    }
                ),
            },
            {
                example: "`,remove include exo`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.remove.help.example.include",
                    {
                        group: "exo",
                        include: "`/include`",
                    }
                ),
            },
        ],
        actionRowComponents: [
            {
                type: Eris.Constants.ComponentTypes.BUTTON,
                style: Eris.Constants.ButtonStyles.LINK,
                url: GROUP_LIST_URL,
                label: LocalizationManager.localizer.translate(
                    guildID,
                    "misc.interaction.fullGroupsList"
                ),
            },
        ],
        priority: 200,
    });

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
            rawGroupsToRemove
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        removeType: RemoveType,
        rawGroupsToRemove: Array<string>,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        let currentMatchedArtists: MatchedArtist[];
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
        }

        if (!currentMatchedArtists) {
            sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.remove.failure.noGroupsSelected.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.remove.failure.noGroupsSelected.description"
                    ),
                },
                interaction
            );
            return;
        }

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            rawGroupsToRemove
        );

        const remainingGroups = currentMatchedArtists.filter(
            (group) => !matchedGroups.some((x) => x.id === group.id)
        );

        const embeds: Array<EmbedPayload> = [];

        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Attempted to set unknown groups. groups = ${unmatchedGroups.join(
                    ", "
                )}`
            );

            let suggestionsText: string = null;
            if (unmatchedGroups.length === 1) {
                const suggestions = await getSimilarGroupNames(
                    unmatchedGroups[0],
                    State.getGuildLocale(messageContext.guildID)
                );

                if (suggestions.length > 0) {
                    suggestionsText = LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.unrecognizedGroups.didYouMean",
                        {
                            suggestions: suggestions.join("\n"),
                        }
                    );
                }
            }

            const descriptionText = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.failure.unrecognizedGroups.description",
                {
                    matchedGroupsAction:
                        LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.remove.failure.unrecognizedGroups.removed"
                        ),
                    helpGroups: "/help groups",
                    unmatchedGroups: unmatchedGroups.join(", "),
                    solution: "",
                }
            );

            embeds.push({
                color: EMBED_ERROR_COLOR,
                author: messageContext.author,
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.failure.unrecognizedGroups.title"
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
                    embeds[0],
                    false,
                    null,
                    embeds.slice(1),
                    interaction
                );
            }

            return;
        }

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
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | ${gameOption} removed: ${rawGroupsToRemove}`
        );

        const optionsMessage = await generateOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: gameOption, reset: false }],
            null,
            null,
            null
        );

        await sendInfoMessage(
            messageContext,
            optionsMessage,
            true,
            null,
            embeds,
            interaction
        );
    }
}
