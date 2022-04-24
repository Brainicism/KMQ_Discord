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
import MessageContext from "../../structures/message_context";
import { setIntersection } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import { GROUP_LIST_URL } from "../../constants";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { GameOption } from "../../enums/game_option_name";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("groups");

export default class GroupsCommand implements BaseCommand {
    aliases = ["group", "artist", "artists"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): HelpDocumentation => ({
        name: "groups",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.groups.help.description",
            {
                groupList: GROUP_LIST_URL,
            }
        ),
        usage: ",groups [group1],{group2}",
        examples: [
            {
                example: "`,groups blackpink`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.groups.help.example.singleGroup",
                    {
                        group: "Blackpink",
                    }
                ),
            },
            {
                example: "`,groups blackpink, bts, red velvet`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.groups.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
                    }
                ),
            },
            {
                example: "`,groups`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.groups.help.example.reset"
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
        priority: 135,
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
                groupsWarning = LocalizationManager.localizer.translate(
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
                                "misc.failure.unrecognizedGroups.added"
                            ),
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: unmatchedGroups.join(", "),
                        solution: LocalizationManager.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            {
                                command: `\`${process.env.BOT_PREFIX}add groups\``,
                            }
                        ),
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
                            solutionStepOne: `\`${process.env.BOT_PREFIX}remove exclude\``,
                            solutionStepTwo: `\`${process.env.BOT_PREFIX}groups\``,
                            allowOrPrevent:
                                LocalizationManager.localizer.translate(
                                    message.guildID,
                                    "misc.failure.groupsExcludeConflict.allow"
                                ),
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
