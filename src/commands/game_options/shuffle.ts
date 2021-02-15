import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { GameOption } from "../../types";

const logger = _logger("shuffle");

export enum ShuffleType {
    RANDOM = "random",
    UNIQUE = "unique",
}

export const DEFAULT_SHUFFLE = ShuffleType.RANDOM;

export default class ShuffleCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "shuffleType",
                type: "enum" as const,
                enums: Object.values(ShuffleType),
            },
        ],
    };

    help = {
        name: "shuffle",
        description: "Choose whether songs are played in truly random order (`random`) or randomly but uniquely until all songs are played (`shuffle`).",
        usage: "!shuffle [random | unique]",
        examples: [
            {
                example: "`!shuffle random`",
                explanation: "Songs will play randomly.",
            },
            {
                example: "`!shuffle unique`",
                explanation: "Every song will play once before any are repeated.",
            },
            {
                example: "`!shuffle`",
                explanation: `Reset to the default shuffle mode of \`${DEFAULT_SHUFFLE}\``,
            },
        ],
        priority: 110,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetShuffleType();
            logger.info(`${getDebugLogHeader(message)} | Shuffle type reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.SHUFFLE_TYPE, reset: true });
            return;
        }

        const shuffleType = parsedMessage.components[0].toLowerCase() as ShuffleType;
        guildPreference.setShuffleType(shuffleType);
        await sendOptionsMessage(message, guildPreference, { option: GameOption.SHUFFLE_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Shuffle set to ${shuffleType}`);
    }
}
