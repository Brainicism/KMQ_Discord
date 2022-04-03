import CommandPrechecks from "../../command_prechecks";
import { GROUP_LIST_URL } from "../../constants";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import {
    getGuildPreference,
    getMatchingGroupNames,
} from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption, MatchedArtist } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("remove");

enum RemoveType {
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
        arguments: [
            {
                enums: Object.values(RemoveType),
                name: "option",
                type: "enum" as const,
            },
        ],
        minArgCount: 2,
    };

    help = (guildID: string): Help => ({
        actionRowComponents: [
            {
                label: state.localizer.translate(
                    guildID,
                    "misc.interaction.fullGroupsList"
                ),
                style: 5 as const,
                type: 2 as const,
                url: GROUP_LIST_URL,
            },
        ],
        description: state.localizer.translate(
            guildID,
            "command.remove.help.description",
            {
                exclude: `\`${process.env.BOT_PREFIX}exclude\``,
                groups: `\`${process.env.BOT_PREFIX}groups\``,
                include: `\`${process.env.BOT_PREFIX}include\``,
            }
        ),
        examples: [
            {
                example: "`,remove groups twice, red velvet`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.remove.help.example.groups",
                    {
                        groupOne: "Twice",
                        groupTwo: "Red Velvet",
                        groups: `\`${process.env.BOT_PREFIX}groups\``,
                    }
                ),
            },
            {
                example: "`,remove exclude BESTie, Dia, iKON`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.remove.help.example.exclude",
                    {
                        exclude: `\`${process.env.BOT_PREFIX}exclude\``,
                        groupOne: "BESTie",
                        groupThree: "iKON",
                        groupTwo: "Dia",
                    }
                ),
            },
            {
                example: "`,remove include exo`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.remove.help.example.include",
                    {
                        group: "exo",
                        include: `\`${process.env.BOT_PREFIX}include\``,
                    }
                ),
            },
        ],
        name: "remove",
        priority: 200,
        usage: `,remove [groups | exclude | include] [${state.localizer.translate(
            guildID,
            "misc.listOfGroups"
        )}]`,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const optionListed = parsedMessage.components[0] as RemoveType;
        let currentMatchedArtists: MatchedArtist[];
        switch (optionListed) {
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
            sendErrorMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "command.remove.failure.noGroupsSelected.description"
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "command.remove.failure.noGroupsSelected.title"
                ),
            });
            return;
        }

        const rawGroupsToRemove = parsedMessage.argument
            .split(" ")
            .slice(1)
            .join(" ")
            .split(",")
            .map((groupName) => groupName.trim().toLowerCase());

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            rawGroupsToRemove
        );

        const remainingGroups = currentMatchedArtists.filter(
            (group) => !matchedGroups.some((x) => x.id === group.id)
        );

        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.description",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        matchedGroupsAction: state.localizer.translate(
                            message.guildID,
                            "command.remove.failure.unrecognizedGroups.removed"
                        ),
                        solution: "",
                        unmatchedGroups: unmatchedGroups.join(", "),
                    }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
            });
        }

        switch (optionListed) {
            case RemoveType.GROUPS:
            case RemoveType.GROUP:
            case RemoveType.ARTIST:
            case RemoveType.ARTISTS:
                await guildPreference.setGroups(remainingGroups);
                await sendOptionsMessage(
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.GROUPS, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Group removed: ${rawGroupsToRemove}`
                );
                break;
            case RemoveType.INCLUDE:
            case RemoveType.INCLUDES:
                await guildPreference.setIncludes(remainingGroups);
                await sendOptionsMessage(
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.INCLUDE, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Include removed: ${rawGroupsToRemove}`
                );
                break;
            case RemoveType.EXCLUDE:
            case RemoveType.EXCLUDES:
                await guildPreference.setExcludes(remainingGroups);
                await sendOptionsMessage(
                    MessageContext.fromMessage(message),
                    guildPreference,
                    [{ option: GameOption.EXCLUDE, reset: false }]
                );

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Exclude removed: ${rawGroupsToRemove}`
                );
                break;
            default:
        }
    };
}
