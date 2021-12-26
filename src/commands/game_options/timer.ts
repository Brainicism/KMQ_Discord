import BaseCommand, { CommandArgs } from "../interfaces/base_command";
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

const logger = new IPCLogger("guessTimeout");

export default class GuessTimeoutCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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

    help = (guildID: string) => ({
            name: "timer",
            description: state.localizer.translate(guildID,
                "Try your best to guess correctly before the timer runs out! Enter a time in seconds, or give no arguments to disable."
            ),
            usage: ",timer [time]",
            examples: [
                {
                    example: "`,timer 15`",
                    explanation: state.localizer.translate(guildID,
                        "In {{{timer}}} seconds, if no user has guessed correctly, the round ends and the next one begins automatically",
                        { timer: String(15) }
                    ),
                },
                {
                    example: "`,timer`",
                    explanation: state.localizer.translate(guildID, "Disables the timer"),
                },
            ],
        });

    helpPriority = 110;
    aliases = ["time", "timeout", "t"];

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
            gameSession.gameRound &&
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
