import type BaseCommand from "../interfaces/base_command";
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
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import { setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import { GROUP_LIST_URL } from "../../constants";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("excludes");

export default class ExcludeCommand implements BaseCommand {
    aliases = ["excludes", "ignore", "ignores"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): HelpDocumentation => ({
        name: "exclude",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.exclude.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        usage: ",exclude [group1],{group2}",
        examples: [
            {
                example: "`,exclude blackpink`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.exclude.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example: "`,exclude blackpink, bts, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.exclude.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    }
                ),
            },
            {
                example: "`,exclude`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.exclude.help.example.reset"
                ),
            },
        ],
        actionRowComponents: [
            {
                style: 5 as const,
                url: GROUP_LIST_URL,
                type: 2 as const,
                label: LocalizationManager.localizer.translate(
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
                excludeWarning = LocalizationManager.localizer.translate(
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
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.description",
                    {
                        matchedGroupsAction:
                            LocalizationManager.localizer.translate(
                                message.guildID,
                                "command.exclude.failure.unrecognizedGroups.excluded"
                            ),
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: `${unmatchedGroups.join(", ")}`,
                        solution: LocalizationManager.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            {
                                command: `\`${process.env.BOT_PREFIX}add exclude\``,
                            }
                        ),
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
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.groupsExcludeConflict.description",
                        {
                            conflictingOptionOne: "`exclude`",
                            conflictingOptionTwo: "`groups`",
                            groupsList: [...intersection]
                                .filter((x) => !x.includes("+"))
                                .join(", "),
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove groups\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}exclude\``,
                            allowOrPrevent:
                                LocalizationManager.localizer.translate(
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
