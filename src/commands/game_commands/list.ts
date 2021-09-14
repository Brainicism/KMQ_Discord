import { getDebugLogHeader, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("list");

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
        usage: ",list [groups | excludes | includes]",
        examples: [
            {
                example: "`,list groups`",
                explanation: "Lists the current `,groups` options",
            },
            {
                example: "`,list excludes`",
                explanation: "Lists the current `,excludes` options",
            },
            {
                example: "`,list includes`",
                explanation: "Lists the current `,includes` options",
            },
        ],
        priority: 200,
    };

    call = async ({ message, parsedMessage, channel }: CommandArgs) => {
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

        optionValue = optionValue || "Nothing currently selected";

        if (optionValue.length > 2000) {
            try {
                await channel.createMessage({
                    content: "Too many groups to list in a Discord message, see the attached file",
                }, {
                    name: "groups.txt",
                    file: Buffer.from(`${optionValue}\n`),
                });
            } catch (e) {
                logger.warn(`${getDebugLogHeader(message)} | Missing ATTACH_FILE permissions`);
                await sendErrorMessage(MessageContext.fromMessage(message), { title: "Error Sending File", description: "Too many groups to list in a Discord message, see the attached file. Make sure that the bot has ATTACH_FILE permissions" });
                return;
            }
        } else {
            await sendInfoMessage(MessageContext.fromMessage(message), { title: `Current \`${optionListed}\` Value`, description: optionValue });
        }

        logger.info(`${getDebugLogHeader(message)} | List '${optionListed}' Retrieved`);
    };
}
