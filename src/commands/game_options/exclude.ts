import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import {
    getGuildPreference,
    getMatchingGroupNames,
} from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import { setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("excludes");

export default class ExcludeCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string) => ({
            name: "exclude",
            description: state.localizer.translate(guildID,
                "Select as many groups that you would like to ignore, separated by commas. A list of group names can be found [here]({{{groupsLink}}}).",
                {
                    groupsLink: `http://${process.env.WEB_SERVER_IP}:${process.env.WEB_SERVER_PORT}/groups`,
                }
            ),
            usage: ",exclude [group1],{group2}",
            examples: [
                {
                    example: "`,exclude blackpink`",
                    explanation: state.localizer.translate(guildID,
                        "Ignore songs from {{{artist}}}",
                        {
                            artist: "Blackpink",
                        }
                    ),
                },
                {
                    example: "`,exclude blackpink, bts, red velvet`",
                    explanation: state.localizer.translate(guildID,
                        "Ignore songs from {{{artistOne}}}, {{{artistTwo}}}, and {{{artistThree}}}",
                        {
                            artistOne: "Blackpink",
                            artistTwo: "BTS",
                            artistThree: "Red Velvet",
                        }
                    ),
                },
                {
                    example: "`,exclude`",
                    explanation: state.localizer.translate(guildID, "Resets the exclude option"),
                },
            ],
        });

    helpPriority = 130;

    aliases = ["excludes", "ignore", "ignores"];

    call = async ({
        message,
        parsedMessage,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.EXCLUDE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.EXCLUDE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Excludes reset.`);
            return;
        }

        let excludeWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                excludeWarning = state.localizer.translate(message.guildID,
                    "Did you mean to use {{{addOrRemove}}} exclude?",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
                    }
                );
            }
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const groups = await getMatchingGroupNames(groupNames);
        let { matchedGroups } = groups;
        const { unmatchedGroups } = groups;
        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Attempted to set unknown excludes. excludes =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(message.guildID, "Unknown Group Name"),
                description: state.localizer.translate(message.guildID,
                    "One or more of the specified group names was not recognized. Those groups that matched are excluded. Please ensure that the group name matches exactly with the list provided by {{{helpGroups}}}. \nThe following groups were **not** recognized:\n {{{unmatchedGroups}}}\nUse {{{addExclude}}} to add the unmatched groups.",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                        addExclude: `\`${process.env.BOT_PREFIX}add exclude\``,
                    }
                ),
                footerText: excludeWarning,
            });
        }

        if (guildPreference.isGroupsMode()) {
            const intersection = setIntersection(
                matchedGroups.map((x) => x.name),
                guildPreference.getGroupNames()
            );

            matchedGroups = matchedGroups.filter(
                (x) => !intersection.has(x.name)
            );
            if (intersection.size > 0) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(message.guildID, "Groups and Exclude Conflict"),
                    description: state.localizer.translate(message.guildID,
                        `One or more of the given {{{exclude}}} groups is already included in {{{groups}}}. \nThe following groups were **not** added to {{{exclude}}}:\n ${[
                            ...intersection,
                        ]
                            .filter((x) => !x.includes("+"))
                            .join(
                                ", "
                            )} \nUse {{{removeGroups}}} and then {{{excludeCommand}}} these groups to prevent them from playing.`,
                        {
                            exclude: `\`${GameOption.EXCLUDE}\``,
                            groups: `\`${GameOption.GROUPS}\``,
                            removeGroups: `\`${process.env.BOT_PREFIX}remove groups\``,
                            excludeCommand: `\`${process.env.BOT_PREFIX}exclude\``,
                        }
                    ),
                });
            }
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setExcludes(matchedGroups);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.EXCLUDE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Excludes set to ${guildPreference.getDisplayedExcludesGroupNames()}`
        );
    };
}
