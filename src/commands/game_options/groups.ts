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
import { setIntersection } from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("groups");

export default class GroupsCommand implements BaseCommand {
    aliases = ["group", "artist", "artists"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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
            "command.groups.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        examples: [
            {
                example: "`,groups blackpink`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.groups.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example: "`,groups blackpink, bts, red velvet`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.groups.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupThree: "Red Velvet",
                        groupTwo: "BTS",
                    }
                ),
            },
            {
                example: "`,groups`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.groups.help.example.reset"
                ),
            },
        ],
        name: "groups",
        priority: 135,
        usage: ",groups [group1],{group2}",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
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
                groupsWarning = state.localizer.translate(
                    message.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
                        command: "groups",
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
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.description",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        matchedGroupsAction: state.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.added"
                        ),
                        solution: state.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            {
                                command: `\`${process.env.BOT_PREFIX}add groups\``,
                            }
                        ),
                        unmatchedGroups: unmatchedGroups.join(", "),
                    }
                ),
                footerText: groupsWarning,
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
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
                    description: state.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.description",
                        {
                            allowOrPrevent: state.localizer.translate(
                                message.guildID,
                                "misc.failure.groupsExcludeConflict.allow"
                            ),
                            conflictingOptionOne: "`exclude`",
                            conflictingOptionTwo: "`groups`",
                            groupsList: [...intersection]
                                .filter((x) => !x.includes("+"))
                                .join(", "),
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove exclude\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}groups\``,
                        }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.title"
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
