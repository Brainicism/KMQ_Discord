import { IPCLogger } from "../../logger";
import { clickableSlashCommand, standardDateFormat } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendInfoMessage,
    sendMessage,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "list";
const logger = new IPCLogger(COMMAND_NAME);

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
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.list.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} type:groups`,
                explanation: i18n.translate(
                    guildID,
                    "command.list.help.example.groups",
                    { groups: clickableSlashCommand("groups") },
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} type:exclude`,
                explanation: i18n.translate(
                    guildID,
                    "command.list.help.example.exclude",
                    { exclude: clickableSlashCommand("exclude") },
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} type:include`,
                explanation: i18n.translate(
                    guildID,
                    "command.list.help.example.include",
                    { include: clickableSlashCommand("include") },
                ),
            },
        ],
        priority: 200,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "type",
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.list.interaction.listType",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.list.interaction.listType",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: [
                        ListType.GROUPS,
                        ListType.INCLUDES,
                        ListType.EXCLUDES,
                    ].map((listType) => ({
                        name: listType,
                        value: listType,
                    })),
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const listType = parsedMessage.components[0] as ListType;
        await ListCommand.listGroups(
            MessageContext.fromMessage(message),
            listType,
        );
    };

    static async listGroups(
        messageContext: MessageContext,
        listType: ListType,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        let optionValue: string | null;
        switch (listType) {
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
            i18n.translate(
                messageContext.guildID,
                "command.list.currentValue.nothingSelected",
            );

        if (optionValue.length > 2000) {
            try {
                sendMessage(
                    messageContext.textChannelID,
                    {
                        content: i18n.translate(
                            messageContext.guildID,
                            "command.list.failure.groupsInFile.description",
                        ),
                        attachments: [
                            {
                                filename: `kmq-groups-${standardDateFormat(
                                    new Date(),
                                )}.txt`,
                                file: optionValue,
                            },
                        ],
                    },
                    undefined,
                    interaction,
                );
            } catch (e) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Missing ATTACH_FILE permissions`,
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.list.failure.groupsInFile.noFilePermissions.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.list.failure.groupsInFile.noFilePermissions.description",
                            { attachFile: "ATTACH_FILE" },
                        ),
                    },
                    interaction,
                );
                return;
            }
        } else {
            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.list.currentValue.title",
                        {
                            optionListed: `\`${listType}\``,
                        },
                    ),
                    description: optionValue,
                },
                false,
                undefined,
                [],
                interaction,
            );
        }

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | List '${listType}' retrieved`,
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionOptions } = getInteractionValue(interaction);
        const artistType = interactionOptions["type"] as ListType;

        await ListCommand.listGroups(messageContext, artistType, interaction);
    }
}
