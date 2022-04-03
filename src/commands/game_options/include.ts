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
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("includes");

export default class IncludeCommand implements BaseCommand {
    aliases = ["includes"];

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
            "command.include.help.description",
            {
                artisttype: "`artisttype`",
                gender: "`gender`",
                groupList: GROUP_LIST_URL,
            }
        ),
        examples: [
            {
                example: "`,include blackpink`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.include.help.example.singleGroup",
                    { group: "Blackpink" }
                ),
            },
            {
                example: "`,include blackpink, bts, red velvet`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.include.help.example.multipleGroups",
                    {
                        groupOne: "Blackpink",
                        groupThree: "Red Velvet",
                        groupTwo: "BTS",
                    }
                ),
            },
            {
                example: "`,include`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.include.help.example.reset"
                ),
            },
        ],
        name: "include",
        priority: 130,
        usage: ",include [group1],{group2}",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.INCLUDE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.INCLUDE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Includes reset.`);
            return;
        }

        let includeWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                includeWarning = state.localizer.translate(
                    message.guildID,
                    "misc.warning.addRemoveOrdering.footer",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
                        command: "include",
                    }
                );
            }
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Game option conflict between include and groups.`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: "`groups`",
                        optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                        optionTwo: "`include`",
                    }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.title"
                ),
            });
            return;
        }

        const groupNames = parsedMessage.argument
            .split(",")
            .map((groupName) => groupName.trim());

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(
            groupNames
        );

        if (unmatchedGroups.length) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Attempted to set unknown includes. includes =  ${unmatchedGroups.join(
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
                            "command.include.failure.unrecognizedGroups.included"
                        ),
                        solution: state.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            {
                                command: `\`${process.env.BOT_PREFIX}add include\``,
                            }
                        ),
                        unmatchedGroups: unmatchedGroups.join(", "),
                    }
                ),
                footerText: includeWarning,
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.unrecognizedGroups.title"
                ),
            });
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setIncludes(matchedGroups);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.INCLUDE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Includes set to ${guildPreference.getDisplayedIncludesGroupNames()}`
        );
    };
}
