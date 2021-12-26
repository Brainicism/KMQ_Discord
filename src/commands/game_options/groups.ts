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

const logger = new IPCLogger("groups");

export const GROUP_LIST_URL = "https://kmq.kpop.gg/static/data/group_list.txt";
export default class GroupsCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string) => ({
            name: "groups",
            description: state.localizer.translate(guildID,
                "Select as many groups that you would like to hear from, separated by commas. A list of group names can be found [here]({{{groupList}}}).",
                {
                    groupList: GROUP_LIST_URL,
                }
            ),
            usage: ",groups [group1],{group2}",
            examples: [
                {
                    example: "`,groups blackpink`",
                    explanation: state.localizer.translate(guildID,
                        "Plays songs only from {{{group}}}",
                        {
                            group: "Blackpink",
                        }
                    ),
                },
                {
                    example: "`,groups blackpink, bts, red velvet`",
                    explanation: state.localizer.translate(guildID,
                        "Plays songs only from {{{groupOne}}}, {{{groupTwo}}}, and {{{groupThree}}}",
                        {
                            groupOne: "Blackpink",
                            groupTwo: "BTS",
                            groupThree: "Red Velvet",
                        }
                    ),
                },
                {
                    example: "`,groups`",
                    explanation: state.localizer.translate(guildID, "Resets the groups option"),
                },
            ],
            actionRowComponents: [
                {
                    style: 5 as const,
                    url: GROUP_LIST_URL,
                    type: 2 as const,
                    label: state.localizer.translate(guildID, "Full List of Groups"),
                },
            ],
        });

    helpPriority = 135;

    aliases = ["group", "artist", "artists"];

    call = async ({
        message,
        parsedMessage,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.GROUPS);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.GROUPS, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Groups reset.`);
            return;
        }

        let groupsWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                groupsWarning = state.localizer.translate(message.guildID,
                    "Did you mean to use {{{addOrRemove}}} groups?",
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
                )} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(
                    ", "
                )}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(message.guildID, "Unknown Group Name"),
                description: state.localizer.translate(message.guildID,
                    "One or more of the specified group names was not recognized. Those groups that matched are added. Please ensure that the group name matches exactly with the list provided by {{{helpGroups}}}. \nThe following groups were **not** recognized:\n {{{unmatchedGroups}}} \nUse {{{add}}} to add the unmatched groups.",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: unmatchedGroups.join(", "),
                        add: `\`${process.env.BOT_PREFIX}add\``,
                    }
                ),
                footerText: groupsWarning,
            });
        }

        if (guildPreference.isExcludesMode()) {
            const intersection = setIntersection(
                matchedGroups.map((x) => x.name),
                guildPreference.getExcludesGroupNames()
            );

            matchedGroups = matchedGroups.filter(
                (x) => !intersection.has(x.name)
            );
            if (intersection.size > 0) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(message.guildID, "Groups and Exclude Conflict"),
                    description: state.localizer.translate(message.guildID,
                        `One or more of the given {{{groups}}} is already included in {{{exclude}}}. \nThe following groups were **not** added to {{{groups}}}:\n ${[
                            ...intersection,
                        ]
                            .filter((x) => !x.includes("+"))
                            .join(
                                ", "
                            )} \nUse {{{removeExclude}}} and then {{{groupsCommand}}} to allow them to play.`,
                        {
                            groups: `\`${GameOption.GROUPS}\``,
                            exclude: `\`${GameOption.EXCLUDE}\``,
                            removeExclude: `\`${process.env.BOT_PREFIX}remove ${GameOption.EXCLUDE}\``,
                            groupsCommand: `\`${process.env.BOT_PREFIX}${GameOption.GROUPS}\``,
                        }
                    ),
                });
                return;
            }
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setGroups(matchedGroups);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.GROUPS, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Groups set to ${guildPreference.getDisplayedGroupNames()}`
        );
    };
}
