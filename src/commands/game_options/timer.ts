import BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";
import Session from "../../structures/session";
import HelpDocumentation from "../../interfaces/help";
import CommandArgs from "../../interfaces/command_args";

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
        description: state.localizer.translate(
            guildID,
            "command.timer.help.description"
        ),
        usage: `,timer [${state.localizer.translate(
            guildID,
            "command.timer.help.usage.seconds"
        )}]`,
        examples: [
            {
                example: "`,timer 15`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.timer.help.example.set",
                    { timer: String(15) }
                ),
            },
            {
                example: "`,timer`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.timer.help.example.reset"
                ),
            },
        ],
        priority: 110,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const session = Session.getSession(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.TIMER);
            if (session) {
                session.stopGuessTimeout();
            }

            await sendOptionsMessage(
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
            session.startGuessTimeout(
                MessageContext.fromMessage(message),
                guildPreference
            );
        }

        await sendOptionsMessage(
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
