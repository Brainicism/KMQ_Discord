import BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { LocaleType, DEFAULT_LOCALE } from "../../helpers/localization_manager";
import dbContext from "../../database_context";
import { state } from "../../kmq_worker";
import { KmqImages } from "../../constants";
import HelpDocumentation from "../../interfaces/help";
import CommandArgs from "../../interfaces/command_args";

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
        description: state.localizer.translate(
            guildID,
            "command.locale.help.description",
            {
                english: `\`${LocaleArgument.ENGLISH}\``,
                korean: `\`${LocaleArgument.KOREAN}\``,
            }
        ),
        usage: `,locale [${state.localizer.translate(
            guildID,
            "command.locale.help.usage.language"
        )}]`,
        examples: [
            {
                example: "`,locale english`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.locale.help.example.toEnglish",
                    {
                        english: state.localizer.translate(
                            guildID,
                            "command.locale.language.en"
                        ),
                    }
                ),
            },
            {
                example: "`,locale korean`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.locale.help.example.toKorean",
                    {
                        korean: state.localizer.translate(
                            guildID,
                            "command.locale.language.ko"
                        ),
                    }
                ),
            },
            {
                example: "`,locale`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.locale.help.example.reset",
                    {
                        defaultLocale: state.localizer.translate(
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
            title: state.localizer.translate(
                message.guildID,
                "command.options.updated",
                { presetOrOption: "Locale" }
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.locale.updatedDescription",
                {
                    language: state.localizer.translate(
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
            state.locales[guildID] = locale;
            await dbContext
                .kmq("locale")
                .insert({ guild_id: guildID, locale })
                .onConflict("guild_id")
                .merge();
        } else {
            if (state.locales[guildID]) {
                delete state.locales[guildID];
                await dbContext
                    .kmq("locale")
                    .where({ guild_id: guildID })
                    .del();
            }
        }
    }
}
