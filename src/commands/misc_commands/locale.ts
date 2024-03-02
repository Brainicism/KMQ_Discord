import { DEFAULT_LOCALE, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import { clickableSlashCommand } from "../../helpers/utils";
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

const COMMAND_NAME = "locale";
const logger = new IPCLogger(COMMAND_NAME);

enum LocaleArgument {
    EN = "en",
    ENGLISH = "english",

    KO = "ko",
    KR = "kr",
    KOREAN = "korean",

    ES = "es",
    SP = "sp",
    SPANISH = "spanish",

    FR = "fr",
    FRENCH = "french",

    JA = "ja",
    JP = "jp",
    JAPANESE = "japanese",

    ZH = "zh",
    CH = "ch",
    CHINESE = "chinese",

    NL = "nl",
    DUTCH = "dutch",

    ID = "id",
    INDONESIAN = "indonesian",

    PT = "pt",
    PT_BR = "pt-BR",
    PORTUGUESE = "portuguese",

    RU = "ru",
    RUSSIAN = "russian",

    DE = "de",
    GERMAN = "german",

    HI = "hi",
    HINDI = "hindi",
}
const LanguageNameToLocaleType = {
    English: LocaleType.EN,
    Korean: LocaleType.KO,
    Spanish: LocaleType.ES,
    French: LocaleType.FR,
    Japanese: LocaleType.JA,
    Chinese: LocaleType.ZH,
    Dutch: LocaleType.NL,
    Indonesian: LocaleType.ID,
    Portuguese: LocaleType.PT,
    Russian: LocaleType.RU,
    German: LocaleType.DE,
    Hindi: LocaleType.HI,
};

export default class LocaleTypeCommand implements BaseCommand {
    aliases = ["botlanguage"];
    slashCommandAliases = ["botlanguage"];

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
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.locale.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} language:English`,
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toLanguage",
                    {
                        language: i18n.translate(
                            guildID,
                            "command.locale.language.en",
                        ),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} language:Korean`,
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toLanguage",
                    {
                        language: i18n.translate(
                            guildID,
                            "command.locale.language.ko",
                        ),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} language:Spanish`,
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toLanguage",
                    {
                        language: i18n.translate(
                            guildID,
                            "command.locale.language.es-ES",
                        ),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} language:French`,
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toLanguage",
                    {
                        language: i18n.translate(
                            guildID,
                            "command.locale.language.fr",
                        ),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} language:Chinese`,
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toLanguage",
                    {
                        language: i18n.translate(
                            guildID,
                            "command.locale.language.zh-CN",
                        ),
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} language:Japanese`,
                explanation: i18n.translate(
                    guildID,
                    "command.locale.help.example.toLanguage",
                    {
                        language: i18n.translate(
                            guildID,
                            "command.locale.language.ja",
                        ),
                    },
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
                        "command.locale.help.interaction.language",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.locale.help.interaction.language",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: Object.keys(LanguageNameToLocaleType).map(
                        (languageName) => ({
                            name: languageName,
                            value: languageName,
                        }),
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

                case LocaleArgument.ES:
                case LocaleArgument.SP:
                case LocaleArgument.SPANISH:
                    localeType = LocaleType.ES;
                    break;

                case LocaleArgument.FR:
                case LocaleArgument.FRENCH:
                    localeType = LocaleType.FR;
                    break;

                case LocaleArgument.JA:
                case LocaleArgument.JP:
                case LocaleArgument.JAPANESE:
                    localeType = LocaleType.JA;
                    break;

                case LocaleArgument.ZH:
                case LocaleArgument.CH:
                case LocaleArgument.CHINESE:
                    localeType = LocaleType.ZH;
                    break;

                case LocaleArgument.NL:
                case LocaleArgument.DUTCH:
                    localeType = LocaleType.NL;
                    break;

                case LocaleArgument.ID:
                case LocaleArgument.INDONESIAN:
                    localeType = LocaleType.ID;
                    break;

                case LocaleArgument.PT:
                case LocaleArgument.PT_BR:
                case LocaleArgument.PORTUGUESE:
                    localeType = LocaleType.PT;
                    break;

                case LocaleArgument.RU:
                case LocaleArgument.RUSSIAN:
                    localeType = LocaleType.RU;
                    break;

                case LocaleArgument.DE:
                case LocaleArgument.GERMAN:
                    localeType = LocaleType.DE;
                    break;

                case LocaleArgument.HI:
                case LocaleArgument.HINDI:
                    localeType = LocaleType.HI;
                    break;

                default:
                    return;
            }
        }

        await LocaleTypeCommand.updateLocaleMessage(
            MessageContext.fromMessage(message),
            localeType,
        );
    };

    static async updateLocale(
        guildID: string,
        locale: LocaleType,
    ): Promise<void> {
        if (locale !== DEFAULT_LOCALE) {
            State.locales[guildID] = locale;
            await dbContext.kmq
                .insertInto("locale")
                .values({ guild_id: guildID, locale })
                .onDuplicateKeyUpdate({ guild_id: guildID, locale })
                .execute();
        } else if (State.locales[guildID]) {
            delete State.locales[guildID];
            await dbContext.kmq
                .deleteFrom("locale")
                .where("guild_id", "=", guildID)
                .execute();
        }
    }

    static async updateLocaleMessage(
        messageContext: MessageContext,
        localeType: LocaleType,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        await LocaleTypeCommand.updateLocale(
            messageContext.guildID,
            localeType,
        );

        sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.options.updated",
                    { presetOrOption: "Locale" },
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.locale.updatedDescription",
                    {
                        language: i18n.translate(
                            messageContext.guildID,
                            `command.locale.language.${localeType}`,
                        ),
                    },
                ),
                thumbnailUrl: KmqImages.THUMBS_UP,
            },
            false,
            undefined,
            [],
            interaction,
        );

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Changed locale to ${localeType}.`,
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
        const localeType =
            LanguageNameToLocaleType[
                interactionOptions[
                    "language"
                ] as keyof typeof LanguageNameToLocaleType
            ];

        await LocaleTypeCommand.updateLocaleMessage(
            messageContext,
            localeType,
            interaction,
        );
    }
}
