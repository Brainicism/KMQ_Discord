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

const logger = new IPCLogger("guessmode");

export enum GuessModeType {
    SONG_NAME = "song",
    ARTIST = "artist",
    BOTH = "both",
}

export const DEFAULT_GUESS_MODE = GuessModeType.SONG_NAME;

export default class GuessModeCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["mode"];

    validations = {
        arguments: [
            {
                enums: Object.values(GuessModeType),
                name: "guessModeType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.guessmode.help.description"
        ),
        examples: [
            {
                example: "`,guessmode song`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.song"
                ),
            },
            {
                example: "`,guessmode artist`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.artist"
                ),
            },
            {
                example: "`,guessmode both`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.both"
                ),
            },
            {
                example: "`,guessmode`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.reset",
                    {
                        defaultGuessMode: DEFAULT_GUESS_MODE,
                    }
                ),
            },
        ],
        name: "guessmode",
        priority: 130,
        usage: ",guessmode [song | artist | both]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.GUESS_MODE_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.GUESS_MODE_TYPE, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | Guess mode type reset.`
            );
            return;
        }

        const modeType =
            parsedMessage.components[0].toLowerCase() as GuessModeType;

        await guildPreference.setGuessModeType(modeType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.GUESS_MODE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Guess mode type set to ${modeType}`
        );
    };
}
