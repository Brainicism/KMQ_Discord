import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugContext } from "../../helpers/discord_utils";
import {  getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
const logger = _logger("seek");
export enum SEEK_TYPE {
    BEGINNING = "beginning",
    RANDOM = "random"
}
export default class SeekCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const seekType = parsedMessage.components[0];
        guildPreference.setSeekType(seekType as SEEK_TYPE);
        await sendOptionsMessage(message, guildPreference, GameOption.SEEK_TYPE);
        logger.info(`${getDebugContext(message)} | Seek type set to ${seekType}`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "seekType",
                type: "enum" as const,
                enums: Object.values(SEEK_TYPE)
            }
        ]
    }

    help = {
        name: "seek",
        description: "Choose whether each song is played from the beginning, or at a random point. Valid values are `beginning` or `random`",
        usage: "!seek [seekType]",
        examples: [
            {
                example: "`!seek random`",
                explanation: "Songs will be played starting from a random point in the middle"
            },
            {
                example: "`!seek beginning`",
                explanation: "Song will be played starting from the very beginning"
            }
        ]
    }
}
