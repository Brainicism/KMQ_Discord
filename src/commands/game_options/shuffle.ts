import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("shuffle");

export enum ShuffleType {
    RANDOM = "random",
    UNIQUE = "unique",
}

export const DEFAULT_SHUFFLE = ShuffleType.UNIQUE;

export default class ShuffleCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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
        usage: ",shuffle [random | unique]",
        examples: [
            {
                example: "`,shuffle random`",
                explanation: "Songs will play randomly.",
            },
            {
                example: "`,shuffle unique`",
                explanation: "Every song will play once before any are repeated.",
            },
            {
                example: "`,shuffle`",
                explanation: `Reset to the default shuffle mode of \`${DEFAULT_SHUFFLE}\``,
            },
        ],
        priority: 110,
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SHUFFLE_TYPE);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SHUFFLE_TYPE, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Shuffle type reset.`);
            return;
        }

        const shuffleType = parsedMessage.components[0].toLowerCase() as ShuffleType;
        await guildPreference.setShuffleType(shuffleType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SHUFFLE_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Shuffle set to ${shuffleType}`);
    };
}
