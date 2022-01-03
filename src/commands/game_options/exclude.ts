import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
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
import { GROUP_LIST_URL } from "../../constants";

const logger = new IPCLogger("excludes");

export default class ExcludeCommand implements BaseCommand {
    aliases = ["excludes", "ignore", "ignores"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): Help => ({
        name: "exclude",
        description: state.localizer.translate(
            guildID,
            "exclude.help.description",
            {
                groupsLink: GROUP_LIST_URL,
            }
        ),
        usage: ",exclude [group1],{group2}",
        examples: [
            {
                example: "`,exclude blackpink`",
                explanation: state.localizer.translate(
                    guildID,
                    "exclude.help.example.singleGroup",
                    {
                        artist: "Blackpink",
                    }
                ),
            },
            {
                example: "`,exclude blackpink, bts, red velvet`",
                explanation: state.localizer.translate(
                    guildID,
                    "exclude.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    }
                ),
            },
            {
                example: "`,exclude`",
                explanation: state.localizer.translate(
                    guildID,
                    "exclude.help.example.reset"
                ),
            },
        ],
        actionRowComponents: [
            {
                style: 5 as const,
                url: GROUP_LIST_URL,
                type: 2 as const,
                label: state.localizer.translate(
                    guildID,
                    "misc.interaction.fullGroupsList"
                ),
            },
        ],
        priority: 130,
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
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.description",
                    {
                        matchedGroupsAction: state.localizer.translate(
                            message.guildID,
                            "exclude.failure.unrecognizedGroups.excluded"
                        ),
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                        solution: `\`${process.env.BOT_PREFIX}add exclude\``,
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
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.description",
                        {
                            conflictingOptionOne: `\`${GameOption.EXCLUDE}\``,
                            conflictingOptionTwo: `\`${GameOption.GROUPS}\``,
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove groups\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}exclude\``,
                            allowOrPrevent: state.localizer.translate(
                                message.guildID,
                                "misc.failure.groupsExcludeConflict.prevent"
                            ),
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
