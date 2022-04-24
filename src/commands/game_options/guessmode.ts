import type BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { GuessModeType } from "../../enums/option_types/guess_mode_type";
import { DEFAULT_GUESS_MODE } from "../../constants";
import LocalizationManager from "../../helpers/localization_manager";
import Session from "../../structures/session";

const logger = new IPCLogger("guessmode");

export default class GuessModeCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    aliases = ["mode"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "guessModeType",
                type: "enum" as const,
                enums: Object.values(GuessModeType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "guessmode",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.guessmode.help.description"
        ),
        usage: ",guessmode [song | artist | both]",
        examples: [
            {
                example: "`,guessmode song`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.song"
                ),
            },
            {
                example: "`,guessmode artist`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.artist"
                ),
            },
            {
                example: "`,guessmode both`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.both"
                ),
            },
            {
                example: "`,guessmode`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.guessmode.help.example.reset",
                    {
                        defaultGuessMode: DEFAULT_GUESS_MODE,
                    }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.GUESS_MODE_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
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
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.GUESS_MODE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Guess mode type set to ${modeType}`
        );
    };
}
