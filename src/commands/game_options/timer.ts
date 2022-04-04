import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("guessTimeout");

export default class GuessTimeoutCommand implements BaseCommand {
    aliases = ["time", "timeout", "t"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                maxValue: 180,
                minValue: 2,
                name: "timer",
                type: "number" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.timer.help.description"
        ),
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
        name: "timer",
        priority: 110,
        usage: `,timer [${state.localizer.translate(
            guildID,
            "command.timer.help.usage.seconds"
        )}]`,
    });

    call = async ({
        message,
        parsedMessage,
        gameSessions,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.TIMER);
            if (gameSession) {
                gameSession.stopGuessTimeout();
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
        if (
            gameSession &&
            gameSession.round &&
            gameSession.connection.playing
        ) {
            // Timer can start mid-song, starting when the user enters the command
            gameSession.stopGuessTimeout();
            gameSession.startGuessTimeout(
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
