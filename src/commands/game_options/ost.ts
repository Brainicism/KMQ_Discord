import { DEFAULT_OST_PREFERENCE } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import OstPreference from "../../enums/option_types/ost_preference";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("ost");

export default class OstCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["osts"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "ostPreference",
                type: "enum" as const,
                enums: Object.values(OstPreference),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "ost",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.ost.help.description"
        ),
        usage: ",ost [include | exclude | exclusive]",
        examples: [
            {
                example: "`,ost include`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.include"
                ),
            },
            {
                example: "`,ost exclude`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.exclude"
                ),
            },
            {
                example: "`,ost exclusive`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.exclusive"
                ),
            },
            {
                example: "`,ost`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.ost.help.example.reset",
                    { defaultOst: `\`${DEFAULT_OST_PREFERENCE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.OST_PREFERENCE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.OST_PREFERENCE, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | OST preference reset.`
            );
            return;
        }

        const ostPreference =
            parsedMessage.components[0].toLowerCase() as OstPreference;

        await guildPreference.setOstPreference(ostPreference);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.OST_PREFERENCE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(
                message
            )} | OST preference set to ${ostPreference}`
        );
    };
}
