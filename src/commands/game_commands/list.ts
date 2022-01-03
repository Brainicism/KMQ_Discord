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
    // Groups with aliases
    GROUPS = "groups",
    GROUP = "group",
    ARTIST = "artist",
    ARTISTS = "artists",

    // Exclude with aliases
    EXCLUDE = "exclude",
    EXCLUDES = "excludes",

    // Include with aliases
    INCLUDE = "include",
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
        description: state.localizer.translate(
            guildID,
            "list.help.description"
        ),
        usage: ",list [groups | excludes | includes]",
        examples: [
            {
                example: "`,list groups`",
                explanation: state.localizer.translate(
                    guildID,
                    "list.help.example.groups",
                    { groups: `\`${process.env.BOT_PREFIX}groups\`` }
                ),
            },
            {
                example: "`,list excludes`",
                explanation: state.localizer.translate(
                    guildID,
                    "list.help.example.exclude",
                    { exclude: `\`${process.env.BOT_PREFIX}excludes\`` }
                ),
            },
            {
                example: "`,list includes`",
                explanation: state.localizer.translate(
                    guildID,
                    "list.help.example.include",
                    { include: `\`${process.env.BOT_PREFIX}includes\`` }
                ),
            },
        ],
        priority: 200,
    });

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
            case ListType.GROUP:
            case ListType.ARTIST:
            case ListType.ARTISTS:
                optionValue = guildPreference.getDisplayedGroupNames(true);
                break;
            case ListType.INCLUDE:
            case ListType.INCLUDES:
                optionValue =
                    guildPreference.getDisplayedIncludesGroupNames(true);
                break;
            case ListType.EXCLUDE:
            case ListType.EXCLUDES:
                optionValue =
                    guildPreference.getDisplayedExcludesGroupNames(true);
                break;
            default:
                optionValue = null;
        }

        optionValue =
            optionValue ||
            state.localizer.translate(
                message.guildID,
                "list.currentValue.nothingSelected"
            );

        if (optionValue.length > 2000) {
            try {
                sendMessage(
                    channel.id,
                    {
                        content: state.localizer.translate(
                            message.guildID,
                            "list.failure.groupsInFile"
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
                    title: state.localizer.translate(
                        message.guildID,
                        "Error Sending File"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "list.failure.groupsInFile.noFilePermissions",
                        { attachFile: "ATTACH_FILE" }
                    ),
                });
                return;
            }
        } else {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "list.currentValue.title",
                    {
                        optionListed: `\`${optionListed}\``,
                    }
                ),
                description: optionValue,
            });
        }

        logger.info(
            `${getDebugLogHeader(message)} | List '${optionListed}' retrieved`
        );
    };
}
