import { getDebugLogHeader, sendErrorMessage, sendOptionsMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference, getMatchingGroupNames } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("add");

enum AddType {
    GROUPS = "groups",
    EXCLUDES = "excludes",
    INCLUDES = "includes",
}

export default class AddCommand implements BaseCommand {
    validations = {
        minArgCount: 2,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(AddType),
            },
        ],
    };

    help = {
        name: "add",
        description: "Adds one or more groups to the current `,groups`, `,excludes`, or `,includes` options",
        usage: "!add [groups | excludes | includes] [list of groups]",
        examples: [
            {
                example: "`!add groups twice, red velvet`",
                explanation: "Adds Twice and Red Velvet to the current `,groups` option",
            },
            {
                example: "`!add excludes BESTie, Dia, iKON`",
                explanation: "Adds BESTie, Dia, and IKON to the current `,excludes` option",
            },
            {
                example: "`!add includes exo`",
                explanation: "Adds EXO to the current `,includes` option",
            },
        ],
        priority: 200,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const optionListed = parsedMessage.components[0] as AddType;
        let groupNamesString: string;
        switch (optionListed) {
            case AddType.GROUPS:
                groupNamesString = guildPreference.getDisplayedGroupNames(true);
                break;
            case AddType.INCLUDES:
                groupNamesString = guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case AddType.EXCLUDES:
                groupNamesString = guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
        }

        const currentGroupNames = !groupNamesString ? [] : groupNamesString.split(",");
        const newGroupNames = parsedMessage.argument.split(" ").slice(1).join(" ")
            .split(",")
            .map((groupName) => groupName.trim());

        const { matchedGroups, unmatchedGroups } = await getMatchingGroupNames(currentGroupNames.concat(newGroupNames));
        if (unmatchedGroups.length) {
            logger.info(`${getDebugLogHeader(message)} | Attempted to set unknown groups. groups =  ${unmatchedGroups.join(", ")}`);
            await sendErrorMessage(MessageContext.fromMessage(message), { title: "Unknown Group Name", description: `One or more of the specified group names was not recognized. Those groups that matched are added. Please ensure that the group name matches exactly with the list provided by \`${process.env.BOT_PREFIX}help groups\` \nThe following groups were **not** recognized:\n ${unmatchedGroups.join(", ")} ` });
        }

        if (matchedGroups.length === 0) {
            return;
        }
        switch (optionListed) {
            case AddType.GROUPS:
                guildPreference.setGroups(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GROUPS, reset: false });
                logger.info(`${getDebugLogHeader(message)} | Group added: ${guildPreference.getDisplayedGroupNames()}`);
                break;
            case AddType.INCLUDES:
                guildPreference.setIncludes(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.INCLUDE, reset: false });
                logger.info(`${getDebugLogHeader(message)} | Include added: ${guildPreference.getDisplayedIncludesGroupNames()}`);
                break;
            case AddType.EXCLUDES:
                guildPreference.setExcludes(matchedGroups);
                await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.EXCLUDE, reset: false });
                logger.info(`${getDebugLogHeader(message)} | Exclude added: ${guildPreference.getDisplayedExcludesGroupNames()}`);
                break;
            default:
        }
    }
}
