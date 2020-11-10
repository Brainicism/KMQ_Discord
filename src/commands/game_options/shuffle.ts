import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugContext } from "../../helpers/discord_utils";
import { GameOption } from "../../types";

const logger = _logger("shuffle");

export enum ShuffleType {
    RANDOM = "random",
    UNIQUE = "unique",
}

export default class ShuffleCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const shuffleType = parsedMessage.components[0].toLowerCase();
        guildPreference.setShuffleType(shuffleType as ShuffleType);
        await sendOptionsMessage(message, guildPreference, GameOption.SHUFFLE_TYPE);
        logger.info(`${getDebugContext(message)} | Shuffle set to ${shuffleType}`);
    }

    validations = {
        minArgCount: 1,
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
        usage: "!shuffle [random|unique]",
        examples: [
            {
                example: "`!shuffle random`",
                explanation: "Songs will play randomly.",
            },
            {
                example: "`!shuffle unique`",
                explanation: "Every song will play once before any are repeated.",
            },
        ],
    };
}
