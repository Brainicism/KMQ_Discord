import type BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { LocaleType } from "../../enums/locale_type";
import dbContext from "../../database_context";
import State from "../../state";
import { DEFAULT_LOCALE, KmqImages } from "../../constants";
import type HelpDocumentation from "../../interfaces/help";
import type CommandArgs from "../../interfaces/command_args";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("locale");

enum LocaleArgument {
    EN = "en",
    ENGLISH = "english",

    KO = "ko",
    KR = "kr",
    KOREAN = "korean",
}

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
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.locale.help.description",
            {
                english: `\`${LocaleArgument.ENGLISH}\``,
                korean: `\`${LocaleArgument.KOREAN}\``,
            }
        ),
        usage: `,locale [${LocalizationManager.localizer.translate(
            guildID,
            "command.locale.help.usage.language"
        )}]`,
        examples: [
            {
                example: "`,locale english`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.locale.help.example.toEnglish",
                    {
                        english: LocalizationManager.localizer.translate(
                            guildID,
                            "command.locale.language.en"
                        ),
                    }
                ),
            },
            {
                example: "`,locale korean`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.locale.help.example.toKorean",
                    {
                        korean: LocalizationManager.localizer.translate(
                            guildID,
                            "command.locale.language.ko"
                        ),
                    }
                ),
            },
            {
                example: "`,locale`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.locale.help.example.reset",
                    {
                        defaultLocale: LocalizationManager.localizer.translate(
                            guildID,
                            `command.locale.language.${DEFAULT_LOCALE}`
                        ),
                    }
                ),
            },
        ],
        priority: 30,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let language: LocaleType;
        if (parsedMessage.components.length === 0) {
            language = DEFAULT_LOCALE;
        } else {
            switch (
                parsedMessage.components[0].toLowerCase() as LocaleArgument
            ) {
                case LocaleArgument.EN:
                case LocaleArgument.ENGLISH:
                    language = LocaleType.EN;
                    break;
                case LocaleArgument.KO:
                case LocaleArgument.KR:
                case LocaleArgument.KOREAN:
                    language = LocaleType.KO;
                    break;
                default:
                    return;
            }
        }

        await LocaleTypeCommand.updateLocale(message.guildID, language);

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: LocalizationManager.localizer.translate(
                message.guildID,
                "command.options.updated",
                { presetOrOption: "Locale" }
            ),
            description: LocalizationManager.localizer.translate(
                message.guildID,
                "command.locale.updatedDescription",
                {
                    language: LocalizationManager.localizer.translate(
                        message.guildID,
                        `command.locale.language.${language}`
                    ),
                }
            ),
            thumbnailUrl: KmqImages.THUMBS_UP,
        });

        logger.info(
            `${getDebugLogHeader(message)} | Changed locale to ${language}.`
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
        } else {
            if (State.locales[guildID]) {
                delete State.locales[guildID];
                await dbContext
                    .kmq("locale")
                    .where({ guild_id: guildID })
                    .del();
            }
        }
    }
}
