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
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("includes");

export default class IncludeCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = (guildID: string) => ({
            name: "include",
            description: state.localizer.translate(guildID,
                "Select as many groups that you would like to forcefully include, ignoring other filters ({{{gender}}}, {{{artisttype}}}, etc), separated by commas. A list of group names can be found [here]({{{groupsLink}}}).",
                {
                    gender: `\`${GameOption.GENDER}\``,
                    artisttype: `\`${GameOption.ARTIST_TYPE}\``,
                    groupsLink: `http://${process.env.WEB_SERVER_IP}:${process.env.WEB_SERVER_PORT}/groups`,
                }
            ),
            usage: ",include [group1],{group2}",
            examples: [
                {
                    example: "`,include blackpink`",
                    explanation: state.localizer.translate(guildID,
                        "Forcefully include songs from {{{group}}}",
                        { group: "Blackpink" }
                    ),
                },
                {
                    example: "`,include blackpink, bts, red velvet`",
                    explanation: state.localizer.translate(guildID,
                        "Forcefully include songs from {{{group1}}}, {{{group2}}}, and {{{group3}}}",
                        {
                            group1: "Blackpink",
                            group2: "BTS",
                            group3: "Red Velvet",
                        }
                    ),
                },
                {
                    example: "`,include`",
                    explanation: state.localizer.translate(guildID, "Resets the include option"),
                },
            ],
        });

    helpPriority = 130;
    aliases = ["includes"];

    call = async ({
        message,
        parsedMessage,
    }: CommandArgs): Promise<void> => {
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
                includeWarning = state.localizer.translate(message.guildID,
                    "Did you mean to use {{{addOrRemove}}} include?",
                    {
                        addOrRemove: `${process.env.BOT_PREFIX}${parsedMessage.components[0]}`,
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
                title: "Game Option Conflict",
                description: state.localizer.translate(message.guildID,
                    "{{{groups}}} game option is currently set. {{{include}}} and {{{groups}}} are incompatible. Remove the {{{groups}}} option by typing {{{groupsCommand}}} to proceed.",
                    {
                        groups: `\`${GameOption.GROUPS}\``,
                        include: `\`${GameOption.INCLUDE}\``,
                        groupsCommand: `\`${process.env.BOT_PREFIX}${GameOption.GROUPS}\``,
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
                title: state.localizer.translate(message.guildID, "Unknown Group Name"),
                description: state.localizer.translate(message.guildID,
                    "One or more of the specified group names was not recognized. Those groups that matched are included. Please ensure that the group name matches exactly with the list provided by {{{helpGroups}}}. \nThe following groups were **not** recognized:\n {{{unmatchedGroups}}} \nUse {{{add}}} to add the unmatched groups.",
                    {
                        helpGroups: `\`${process.env.BOT_PREFIX}help groups\``,
                        unmatchedGroups: unmatchedGroups.join(", "),
                        add: `\`${process.env.BOT_PREFIX}add\``,
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
