import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
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

const logger = new IPCLogger("guessTimeout");

export default class GuessTimeoutCommand implements BaseCommand {
    aliases = ["time", "timeout", "t"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "timer",
                type: "number" as const,
                minValue: 2,
                maxValue: 180,
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "timer",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.timer.help.description"
        ),
        usage: `,timer [${LocalizationManager.localizer.translate(
            guildID,
            "command.timer.help.usage.seconds"
        )}]`,
        examples: [
            {
                example: "`,timer 15`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.timer.help.example.set",
                    { timer: String(15) }
                ),
            },
            {
                example: "`,timer`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.timer.help.example.reset"
                ),
            },
        ],
        priority: 110,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        const session = Session.getSession(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.TIMER);
            if (session) {
                session.stopGuessTimeout();
            }

            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.TIMER, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | Guess timeout disabled.`
            );
            return;
        }

        const time = parseInt(parsedMessage.components[0]);

        await guildPreference.setGuessTimeout(time);
        if (session && session.round && session.connection.playing) {
            // Timer can start mid-song, starting when the user enters the command
            session.stopGuessTimeout();
            session.startGuessTimeout(MessageContext.fromMessage(message));
        }

        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.TIMER, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Guess timeout set to ${
                guildPreference.gameOptions.guessTimeout
            }`
        );
    };
}
