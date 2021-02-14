import { getDebugLogHeader, sendInfoMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";

const logger = _logger("list");

enum ListType {
    GROUPS = "groups",
    EXCLUDES = "excludes",
    INCLUDES = "includes",
}

export default class ListCommand implements BaseCommand {
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "option",
                type: "enum" as const,
                enums: Object.values(ListType),
            },
        ],
    };

    help = {
        name: "list",
        description: "Displays the currently selected groups for a given game option.",
        usage: "!list [groups | excludes | includes]",
        examples: [
            {
                example: "`!list groups`",
                explanation: "Lists the current `,groups` options",
            },
            {
                example: "`!list excludes`",
                explanation: "Lists the current `,excludes` options",
            },
            {
                example: "`!includes`",
                explanation: "Lists the current `,includes` options",
            },
        ],
        priority: 200,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const optionListed = parsedMessage.components[0] as ListType;
        let optionValue: string;
        switch (optionListed) {
            case ListType.GROUPS:
                optionValue = guildPreference.getDisplayedGroupNames(true);
                break;
            case ListType.INCLUDES:
                optionValue = guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case ListType.EXCLUDES:
                optionValue = guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
                optionValue = null;
        }
        await sendInfoMessage(message, `Current \`${optionListed}\` value`, optionValue || "Nothing currently selected.");
        logger.info(`${getDebugLogHeader(message)} | List '${optionListed}' retrieved`);
    }
}
