import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendMessage,
} from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";

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

    help = (guildID: string): Help => ({
            name: "list",
            description: state.localizer.translate(guildID,
                "Displays the currently selected groups for a given game option."
            ),
            usage: ",list [groups | excludes | includes]",
            examples: [
                {
                    example: "`,list groups`",
                    explanation: state.localizer.translate(guildID,
                        "Lists the current {{{groups}}} options",
                        { groups: "`,groups`" }
                    ),
                },
                {
                    example: "`,list excludes`",
                    explanation: state.localizer.translate(guildID,
                        "Lists the current {{{excludes}}} options",
                        { excludes: "`,excludes`" }
                    ),
                },
                {
                    example: "`,list includes`",
                    explanation: state.localizer.translate(guildID,
                        "Lists the current {{{includes}}} options",
                        { includes: "`,includes`" }
                    ),
                },
            ],
        });

    helpPriority = 200;

    call = async ({
        message,
        parsedMessage,
        channel,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const optionListed = parsedMessage.components[0] as ListType;
        let optionValue: string;
        switch (optionListed) {
            case ListType.GROUPS:
                optionValue = guildPreference.getDisplayedGroupNames(true);
                break;
            case ListType.INCLUDES:
                optionValue =
                    guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case ListType.EXCLUDES:
                optionValue =
                    guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
                optionValue = null;
        }

        optionValue = optionValue || "Nothing currently selected";

        if (optionValue.length > 2000) {
            try {
                sendMessage(
                    channel.id,
                    {
                        content: state.localizer.translate(message.guildID,
                            "Too many groups to list in a Discord message, see the attached file"
                        ),
                    },
                    {
                        name: "groups.txt",
                        file: Buffer.from(`${optionValue}\n`),
                    }
                );
            } catch (e) {
                logger.warn(
                    `${getDebugLogHeader(
                        message
                    )} | Missing ATTACH_FILE permissions`
                );

                await sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(message.guildID, "Error Sending File"),
                    description: state.localizer.translate(message.guildID,
                        "Too many groups to list in a Discord message, see the attached file. Make sure that the bot has {{{attachFile}}} permissions",
                        { attachFile: "ATTACH_FILE" }
                    ),
                });
                return;
            }
        } else {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(message.guildID, "Current {{{optionListed}}} Value", {
                    optionsListed: `\`${optionListed}\``,
                }),
                description: optionValue,
            });
        }

        logger.info(
            `${getDebugLogHeader(message)} | List '${optionListed}' retrieved`
        );
    };
}
