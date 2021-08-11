import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("seek");
export enum SeekType {
    BEGINNING = "beginning",
    RANDOM = "random",
    MIDDLE = "middle",
}

export const DEFAULT_SEEK = SeekType.RANDOM;

export default class SeekCommand implements BaseCommand {
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

    help = {
        name: "seek",
        description: "Choose whether each song is played from the beginning, middle, or at a random point",
        usage: ",seek [beginning | middle | random]",
        examples: [
            {
                example: "`,seek random`",
                explanation: "Songs will be played starting from a random point in the middle",
            },
            {
                example: "`,seek middle`",
                explanation: "Songs will be played starting from the middle point",
            },
            {
                example: "`,seek beginning`",
                explanation: "Song will be played starting from the very beginning",
            },
            {
                example: "`,seek`",
                explanation: `Reset to the default seek of \`${DEFAULT_SEEK}\``,
            },
        ],
        priority: 130,
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SEEK_TYPE);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SEEK_TYPE, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Seek reset.`);
            return;
        }

        const seekType = parsedMessage.components[0] as SeekType;
        await guildPreference.setSeekType(seekType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SEEK_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Seek type set to ${seekType}`);
    };
}
