import { getDebugLogHeader, sendErrorMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("remove");

enum RemoveType {
    GROUPS = "groups",
    EXCLUDES = "excludes",
    INCLUDES = "includes",
}

export default class RemoveCommand implements BaseCommand {
    validations = {
        minArgCount: 2,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(RemoveType),
            },
        ],
    };

    help = {
        name: "remove",
        description: "Removes one or more groups from the current `,groups`, `,excludes`, or `,includes` options",
        usage: "!remove [groups | excludes | includes] [list of groups]",
        examples: [
            {
                example: "`!remove groups twice, red velvet`",
                explanation: "Removes Twice and Red Velvet from the current `,groups` option",
            },
            {
                example: "`!remove excludes BESTie, Dia, iKON`",
                explanation: "Removes BESTie, Dia, and IKON from the current `,excludes` option",
            },
            {
                example: "`!remove includes exo`",
                explanation: "Removes EXO from the current `,includes` option",
            },
        ],
        priority: 200,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const optionListed = parsedMessage.components[0] as RemoveType;
        let groupNamesString: string;
        switch (optionListed) {
            case RemoveType.GROUPS:
                groupNamesString = guildPreference.getDisplayedGroupNames(true);
                break;
            case RemoveType.INCLUDES:
                groupNamesString = guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case RemoveType.EXCLUDES:
                groupNamesString = guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
        }

        const currentGroupNames = !groupNamesString ? [] : groupNamesString.split(",");

        if (currentGroupNames.length === 0) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Remove failed", description: "There are no groups currently selected" });
            return;
        }

        const newGroupNames = parsedMessage.argument.split(" ").slice(1).join(" ")
            .split(",")
            .map((groupName) => groupName.trim().toLowerCase());

        const remainingGroups = currentGroupNames.filter((group) => !newGroupNames.includes(group.toLowerCase()));

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(remainingGroups);
        if (unmatchedGroups.length) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Unknown Group Name", description: `One or more of the specified group names was not recognized. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\` \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} ` });
            return;
        }

        switch (optionListed) {
            case RemoveType.GROUPS:
                guildPreference.setGroups(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GROUPS, reset: false });
                logger.info(`${getDebugLogHeader(message)} | Group removed: ${guildPreference.getDisplayedGroupNames()}`);
                break;
            case RemoveType.INCLUDES:
                guildPreference.setIncludes(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.INCLUDE, reset: false });
                logger.info(`${getDebugLogHeader(message)} | Include removed: ${guildPreference.getDisplayedIncludesGroupNames()}`);
                break;
            case RemoveType.EXCLUDES:
                guildPreference.setExcludes(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.EXCLUDE, reset: false });
                logger.info(`${getDebugLogHeader(message)} | Exclude removed: ${guildPreference.getDisplayedExcludesGroupNames()}`);
                break;
            default:
        }
    }
}
