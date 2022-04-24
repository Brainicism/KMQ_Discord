import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
import { LanguageType } from "../../enums/option_types/language_type";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("language");

export default class LanguageCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "language",
                type: "enum" as const,
                enums: Object.values(LanguageType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "language",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.language.help.description"
        ),
        usage: ",language [korean | all]",
        examples: [
            {
                example: "`,language korean`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.language.help.example.korean"
                ),
            },
            {
                example: "`,language all`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.language.help.example.all"
                ),
            },
            {
                example: "`,language`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.language.help.example.reset",
                    { defaultLanguage: `\`${LanguageType.ALL}\`` }
                ),
            },
        ],
        priority: 150,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.LANGUAGE_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.LANGUAGE_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Language type reset.`);
            return;
        }

        const languageType = parsedMessage.components[0] as LanguageType;
        await guildPreference.setLanguageType(languageType);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.LANGUAGE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Language type set to ${languageType}`
        );
    };
}
