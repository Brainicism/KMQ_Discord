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

const logger = new IPCLogger("shuffle");

export enum ShuffleType {
    RANDOM = "random",
    UNIQUE = "unique",
}

export const DEFAULT_SHUFFLE = ShuffleType.UNIQUE;

export default class ShuffleCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(ShuffleType),
                name: "shuffleType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.shuffle.help.description",
            {
                random: `\`${ShuffleType.RANDOM}\``,
                shuffle: `\`${ShuffleType.UNIQUE}\``,
            }
        ),
        examples: [
            {
                example: "`,shuffle random`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.random"
                ),
            },
            {
                example: "`,shuffle unique`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.unique"
                ),
            },
            {
                example: "`,shuffle`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.shuffle.help.example.reset",
                    { defaultShuffle: `\`${DEFAULT_SHUFFLE}\`` }
                ),
            },
        ],
        name: "shuffle",
        priority: 110,
        usage: ",shuffle [random | unique]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SHUFFLE_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SHUFFLE_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Shuffle type reset.`);
            return;
        }

        const shuffleType =
            parsedMessage.components[0].toLowerCase() as ShuffleType;

        await guildPreference.setShuffleType(shuffleType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SHUFFLE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Shuffle set to ${shuffleType}`
        );
    };
}
