import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
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

const logger = new IPCLogger("locale");

export default class LocaleTypeCommand implements BaseCommand {
    aliases = ["botlanguage"];

    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "localeType",
                type: "enum" as const,
                enums: Object.values(LocaleType),
            },
        ],
    };

    help = (guildID: string): Help => ({
        name: "locale",
        description: state.localizer.translate(
            guildID,
            "command.locale.help.description"
        ),
        usage: ",locale [language]",
        examples: [
            {
                example: "`,locale en`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.locale.help.example.toEnglish"
                ),
            },
            {
                example: "`,locale ko`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.locale.help.example.toKorean"
                ),
            },
            {
                example: "`,locale`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.locale.help.example.reset",
                    { defaultLocale: DEFAULT_LOCALE }
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
            language = parsedMessage.components[0] as LocaleType;
        }

        LocaleTypeCommand.updateLocale(message.guildID, language);

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "options.updated",
                { presetOrOption: "Locale" }
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.locale.updatedDescription",
                { language }
            ),
            thumbnailUrl: KmqImages.THUMBS_UP,
        });

        logger.info(
            `${getDebugLogHeader(message)} | Changed locale to ${language}.`
        );
    };

    static updateLocale(guildID: string, locale: LocaleType): void {
        if (locale !== DEFAULT_LOCALE) {
            state.locales[guildID] = locale;
            dbContext
                .kmq("locale")
                .insert({ guild_id: guildID, locale })
                .onConflict("guild_id")
                .merge();
        } else {
            if (state.locales[guildID]) {
                delete state.locales[guildID];
                dbContext
                    .kmq("locale")
                    .select({ guild_id: guildID, locale })
                    .del();
            }
        }
    }
}
