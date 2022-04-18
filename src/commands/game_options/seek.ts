import BaseCommand from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";
import { SeekType } from "../../enums/option_types/seek_type";

const logger = new IPCLogger("seek");

export const DEFAULT_SEEK = SeekType.RANDOM;

export default class SeekCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "seekType",
                type: "enum" as const,
                enums: Object.values(SeekType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "seek",
        description: state.localizer.translate(
            guildID,
            "command.seek.help.description"
        ),
        usage: ",seek [beginning | middle | random]",
        examples: [
            {
                example: "`,seek random`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.seek.help.example.random"
                ),
            },
            {
                example: "`,seek middle`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.seek.help.example.middle"
                ),
            },
            {
                example: "`,seek beginning`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.seek.help.example.beginning"
                ),
            },
            {
                example: "`,seek`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.seek.help.example.reset",
                    {
                        defaultSeek: DEFAULT_SEEK,
                    }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SEEK_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SEEK_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Seek reset.`);
            return;
        }

        const seekType = parsedMessage.components[0] as SeekType;
        await guildPreference.setSeekType(seekType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SEEK_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Seek type set to ${seekType}`
        );
    };
}
