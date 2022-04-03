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

const logger = new IPCLogger("seek");

export enum SeekType {
    BEGINNING = "beginning",
    RANDOM = "random",
    MIDDLE = "middle",
}

export const DEFAULT_SEEK = SeekType.RANDOM;

export default class SeekCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(SeekType),
                name: "seekType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.seek.help.description"
        ),
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
        name: "seek",
        priority: 130,
        usage: ",seek [beginning | middle | random]",
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
