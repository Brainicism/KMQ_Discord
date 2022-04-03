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

const logger = new IPCLogger("excludes");

export default class ExcludeCommand implements BaseCommand {
    aliases = ["excludes", "ignore", "ignores"];

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
            "command.exclude.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        examples: [
            {
                example: "`,exclude blackpink`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.exclude.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example: "`,exclude blackpink, bts, red velvet`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.exclude.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupThree: "Red Velvet",
                        groupTwo: "BTS",
                    }
                ),
            },
            {
                example: "`,exclude`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.exclude.help.example.reset"
                ),
            },
        ],
        name: "exclude",
        priority: 130,
        usage: ",exclude [group1],{group2}",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
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
                excludeWarning = state.localizer.translate(
                    message.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
                        command: "exclude",
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
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.description",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        matchedGroupsAction: state.localizer.translate(
                            message.guildID,
                            "command.exclude.failure.unrecognizedGroups.excluded"
                        ),
                        solution: state.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            {
                                command: `\`${process.env.BOT_PREFIX}add exclude\``,
                            }
                        ),
                        unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                    }
                ),
                footerText: excludeWarning,
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
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
                    description: state.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.description",
                        {
                            allowOrPrevent: state.localizer.translate(
                                message.guildID,
                                "misc.failure.groupsExcludeConflict.prevent"
                            ),
                            conflictingOptionOne: "`exclude`",
                            conflictingOptionTwo: "`groups`",
                            groupsList: [...intersection]
                                .filter((x) => !x.includes("+"))
                                .join(", "),
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove groups\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}exclude\``,
                        }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.title"
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
