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
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";
import { GROUP_LIST_URL } from "../../constants";

const logger = new IPCLogger("includes");

export default class IncludeCommand implements BaseCommand {
    aliases = ["includes"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string): Help => ({
        name: "include",
        description: state.localizer.translate(
            guildID,
            "command.include.help.description",
            {
                gender: `\`${GameOption.GENDER}\``,
                artisttype: `\`${GameOption.ARTIST_TYPE}\``,
                groupsLink: GROUP_LIST_URL,
            }
        ),
        usage: ",include [group1],{group2}",
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
                        groupTwo: "BTS",
                        groupThree: "Red Velvet",
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
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: `\`${GameOption.GROUPS}\``,
                        optionTwo: `\`${GameOption.INCLUDE}\``,
                        optionOneCommand: `\`${process.env.BOT_PREFIX}${GameOption.GROUPS}\``,
                    }
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
                            "command.include.failure.unrecognizedGroups.included"
                        ),
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: unmatchedGroups.join(", "),
                        solution: state.localizer.translate(
                            message.guildID,
                            "misc.failure.unrecognizedGroups.solution",
                            { command: `\`${process.env.BOT_PREFIX}add\`` }
                        ),
                    }
                ),
                footerText: includeWarning,
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
