import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendMessage,
} from "../../helpers/discord_utils";
import type BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocalizationManager from "../../helpers/localization_manager";
import GuildPreference from "../../structures/guild_preference";

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

    help = (guildID: string): HelpDocumentation => ({
        name: "list",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.list.help.description"
        ),
        usage: ",list [groups | exclude | include]",
        examples: [
            {
                example: "`,list groups`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.list.help.example.groups",
                    { groups: `\`${process.env.BOT_PREFIX}groups\`` }
                ),
            },
            {
                example: "`,list exclude`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.list.help.example.exclude",
                    { exclude: `\`${process.env.BOT_PREFIX}exclude\`` }
                ),
            },
            {
                example: "`,list include`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.list.help.example.include",
                    { include: `\`${process.env.BOT_PREFIX}include\`` }
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
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

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
            LocalizationManager.localizer.translate(
                message.guildID,
                "command.list.currentValue.nothingSelected"
            );

        if (optionValue.length > 2000) {
            try {
                sendMessage(
                    channel.id,
                    {
                        content: LocalizationManager.localizer.translate(
                            message.guildID,
                            "command.list.failure.groupsInFile.description"
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
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.list.failure.groupsInFile.noFilePermissions.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.list.failure.groupsInFile.noFilePermissions.description",
                        { attachFile: "ATTACH_FILE" }
                    ),
                });
                return;
            }
        } else {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.list.currentValue.title",
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
