import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("special");
export enum SpecialType {
    REVERSE = "reverse",
    SLOW = "slow",
    FAST = "fast",
    FASTER = "faster",
}

export const specialFfmpegArgs = {
    [SpecialType.REVERSE]: (seek: number) => ({
        inputArgs: [],
        encoderArgs: ["-af", "areverse", "-ss", seek.toString()],
    }),
    [SpecialType.SLOW]: (seek: number) => ({
        inputArgs: [],
        encoderArgs: ["-filter:a", "atempo=0.5", "-ss", (seek * 2).toString()],
    }),
    [SpecialType.FAST]: (seek: number) => ({
        inputArgs: [],
        encoderArgs: ["-filter:a", "atempo=1.5", "-ss", (seek / 1.5).toString()],
    }),
    [SpecialType.FASTER]: (seek: number) => ({
        inputArgs: [],
        encoderArgs: ["-filter:a", "atempo=2", "-ss", (seek / 2).toString()],
    }),
};

export default class SpecialCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "specialType",
                type: "enum" as const,
                enums: Object.values(SpecialType),
            },
        ],
    };

    help = {
        name: "special",
        description: "Hey. This hasn't been announced yet, but check out the KMQ server to try it out! Play a special mode with modified audio.",
        usage: ",special [reverse | slow | fast | faster]",
        examples: [
            {
                example: "`,special reverse`",
                explanation: "Plays the song in reverse",
            },
            {
                example: "`,special slow`",
                explanation: "Plays the song at a slow speed",
            },
            {
                example: "`,special fast`",
                explanation: "Plays the song at a fast speed",
            },
            {
                example: "`,special faster`",
                explanation: "Plays the song at a faster speed",
            },
            {
                example: "`,special`",
                explanation: "Reset the special option",
            },
        ],
        priority: 130,
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        if (process.env.DEBUG_SERVER_ID !== message.guildID) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error", description: "This is an unreleased game option, and can only be used on the official KMQ server" });
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SPECIAL_TYPE, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Special reset.`);
            return;
        }

        const specialType = parsedMessage.components[0] as SpecialType;
        await guildPreference.setSpecialType(specialType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SPECIAL_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Special type set to ${specialType}`);
    };
}
