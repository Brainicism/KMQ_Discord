import { DEFAULT_LOCALE, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("locale");

enum LocaleArgument {
    EN = "en",
    ENGLISH = "english",

    KO = "ko",
    KR = "kr",
    KOREAN = "korean",
}

const LanguageNameToLocaleType = {
    English: LocaleType.EN,
    Korean: LocaleType.KO,
};

export default class LocaleTypeCommand implements BaseCommand {
    aliases = ["botlanguage"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "localeType",
                type: "enum" as const,
                enums: Object.values(LocaleArgument),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "locale",
        description: i18n.translate(
            guildID,
            "command.locale.help.description",
            {
                english: `\`${LocaleArgument.ENGLISH}\``,
                korean: `\`${LocaleArgument.KOREAN}\``,
            }
        ),
        usage: `/locale language:[${i18n.translate(
            guildID,
            "command.locale.help.usage.language"
        )}]`,
        examples: [
            {
                example: "`/locale language:English`",
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toEnglish",
                    {
                        english: i18n.translate(
                            guildID,
                            "command.locale.language.en"
                        ),
                    }
                ),
            },
            {
                example: "`/locale language:Korean`",
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toKorean",
                    {
                        korean: i18n.translate(
                            guildID,
                            "command.locale.language.ko"
                        ),
                    }
                ),
            },
        ],
        priority: 30,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "language",
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.locale.interaction.language"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: Object.keys(LanguageNameToLocaleType).map(
                        (languageName) => ({
                            name: languageName,
                            value: languageName,
                        })
                    ),
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let localeType: LocaleType;
        if (parsedMessage.components.length === 0) {
            localeType = DEFAULT_LOCALE;
        } else {
            switch (
                parsedMessage.components[0].toLowerCase() as LocaleArgument
            ) {
                case LocaleArgument.EN:
                case LocaleArgument.ENGLISH:
                    localeType = LocaleType.EN;
                    break;
                case LocaleArgument.KO:
                case LocaleArgument.KR:
                case LocaleArgument.KOREAN:
                    localeType = LocaleType.KO;
                    break;
                default:
                    return;
            }
        }

        await LocaleTypeCommand.updateLocaleMessage(
            MessageContext.fromMessage(message),
            localeType
        );
    };

    static async updateLocale(
        guildID: string,
        locale: LocaleType
    ): Promise<void> {
        if (locale !== DEFAULT_LOCALE) {
            State.locales[guildID] = locale;
            await dbContext
                .kmq("locale")
                .insert({ guild_id: guildID, locale })
                .onConflict("guild_id")
                .merge();
        } else if (State.locales[guildID]) {
            delete State.locales[guildID];
            await dbContext.kmq("locale").where({ guild_id: guildID }).del();
        }
    }

    static async updateLocaleMessage(
        messageContext: MessageContext,
        localeType: LocaleType,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        await LocaleTypeCommand.updateLocale(
            messageContext.guildID,
            localeType
        );

        sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.options.updated",
                    { presetOrOption: "Locale" }
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.locale.updatedDescription",
                    {
                        language: i18n.translate(
                            messageContext.guildID,
                            `command.locale.language.${localeType}`
                        ),
                    }
                ),
                thumbnailUrl: KmqImages.THUMBS_UP,
            },
            null,
            null,
            [],
            interaction
        );

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Changed locale to ${localeType}.`
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionOptions } = getInteractionValue(interaction);
        const localeType =
            LanguageNameToLocaleType[interactionOptions["language"]];

        await LocaleTypeCommand.updateLocaleMessage(
            messageContext,
            localeType,
            interaction
        );
    }
}
