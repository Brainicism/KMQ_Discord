import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

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
        arguments: [
            {
                enums: Object.values(ListType),
                name: "option",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 1,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.list.help.description"
        ),
        examples: [
            {
                example: "`,list groups`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.list.help.example.groups",
                    { groups: `\`${process.env.BOT_PREFIX}groups\`` }
                ),
            },
            {
                example: "`,list exclude`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.list.help.example.exclude",
                    { exclude: `\`${process.env.BOT_PREFIX}exclude\`` }
                ),
            },
            {
                example: "`,list include`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.list.help.example.include",
                    { include: `\`${process.env.BOT_PREFIX}include\`` }
                ),
            },
        ],
        name: "list",
        priority: 200,
        usage: ",list [groups | exclude | include]",
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
                "command.list.currentValue.nothingSelected"
            );

        if (optionValue.length > 2000) {
            try {
                sendMessage(
                    channel.id,
                    {
                        content: state.localizer.translate(
                            message.guildID,
                            "command.list.failure.groupsInFile"
                        ),
                    },
                    {
                        file: Buffer.from(`${optionValue}\n`),
                        name: "groups.txt",
                    }
                );
            } catch (e) {
                logger.warn(
                    `${getDebugLogHeader(
                        message
                    )} | Missing ATTACH_FILE permissions`
                );

                await sendErrorMessage(MessageContext.fromMessage(message), {
                    description: state.localizer.translate(
                        message.guildID,
                        "command.list.failure.groupsInFile.noFilePermissions.description",
                        { attachFile: "ATTACH_FILE" }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "command.list.failure.groupsInFile.noFilePermissions.title"
                    ),
                });
                return;
            }
        } else {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                description: optionValue,
                title: state.localizer.translate(
                    message.guildID,
                    "command.list.currentValue.title",
                    {
                        optionListed: `\`${optionListed}\``,
                    }
                ),
            });
        }

        logger.info(
            `${getDebugLogHeader(message)} | List '${optionListed}' retrieved`
        );
    };
}
