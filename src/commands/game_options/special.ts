import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference, isUserPremium } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import GuildPreference from "../../structures/guild_preference";

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

export async function resetSpecial(guildPreference: GuildPreference, messageContext: MessageContext, premiumEnded: boolean) {
    await guildPreference.reset(GameOption.SPECIAL_TYPE);
    sendOptionsMessage(messageContext, guildPreference, { option: GameOption.SPECIAL_TYPE, reset: true });
    logger.info(`${getDebugLogHeader(messageContext)} | Special reset. Reset caused by premium ending = ${premiumEnded}`);
}

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
        description: "Modify the song playback speed. Only premium players (see `,premium`) can use this command outside of the official KMQ server.",
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
        if (process.env.DEBUG_SERVER_ID !== message.guildID || !(await isUserPremium(message.author.id))) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Premium Option", description: "This option can only be used by premium KMQ supporters, or in the official KMQ server." });
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            resetSpecial(guildPreference, MessageContext.fromMessage(message), false);
            return;
        }

        const specialType = parsedMessage.components[0] as SpecialType;
        await guildPreference.setSpecialType(specialType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.SPECIAL_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Special type set to ${specialType}`);
    };
}
