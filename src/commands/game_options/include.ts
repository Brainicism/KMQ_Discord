import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("includes");

export default class IncludeCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    help = {
        name: "include",
        description: `Select as many groups that you would like to forcefully include, ignoring other filters (\`gender\`, \`artisttype\`, etc), separated by commas. A list of group names can be found [here](http://${process.env.WEB_SERVER_IP}:${process.env.WEB_SERVER_PORT}/groups)`,
        usage: ",include [group1],{group2}",
        examples: [
            {
                example: "`,include blackpink`",
                explanation: "Forcefully include songs from Blackpink",
            },
            {
                example: "`,include blackpink, bts, red velvet`",
                explanation: "Forcefully include songs from Blackpink, BTS, and Red Velvet",
            },
            {
                example: "`,include`",
                explanation: "Resets the include option",
            },
        ],
        priority: 130,
    };

    aliases = ["includes"];

    call = async ({ message, parsedMessage }: CommandArgs) : Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.INCLUDE);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.INCLUDE, reset: true }]);
            logger.info(`${getDebugLogHeader(message)} | Includes reset.`);
            return;
        }

        let includeWarning = "";
        if (parsedMessage.components.length > 1) {
            if (["add", "remove"].includes(parsedMessage.components[0])) {
                includeWarning = `Did you mean to use ${process.env.BOT_PREFIX}${parsedMessage.components[0]} include?`;
            }
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between include and groups.`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Conflict", description: `\`groups\` game option is currently set. \`include\` and \`groups\` are incompatible. Remove the \`groups\` option by typing \`${process.env.BOT_PREFIX}groups\` to proceed.` });
            return;
        }

        const groupNames = parsedMessage.argument.split(",").map((groupName) => groupName.trim());
        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(groupNames);
        if (unmatchedGroups.length) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown includes. includes =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Unknown Group Name",
                description: `One or more of the specified group names was not recognized. Those groups that matched are included. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\`. \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} \nUse \`${process.env.BOT_PREFIX}add\` to add the unmatched groups.`,
                footerText: includeWarning });
        }

        if (matchedGroups.length === 0) {
            return;
        }

        await guildPreference.setIncludes(matchedGroups);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.INCLUDE, reset: false }]);
        logger.info(`${getDebugLogHeader(message)} | Includes set to ${guildPreference.getDisplayedIncludesGroupNames()}`);
    };
}
