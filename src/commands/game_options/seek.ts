import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("seek");
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
        description: "Choose whether each song is played from the beginning, or at a random point. Valid values are `beginning` or `random`",
        usage: ",seek [seekType]",
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

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetSeekType();
            logger.info(`${getDebugLogHeader(message)} | Seek reset.`);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SEEK_TYPE, reset: true });
            return;
        }
        const seekType = parsedMessage.components[0] as SeekType;
        guildPreference.setSeekType(seekType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SEEK_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Seek type set to ${seekType}`);
    }
}
