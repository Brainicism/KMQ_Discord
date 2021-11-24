import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("special");
export enum SpecialType {
    REVERSE = "reverse",
    SLOW = "slow",
    FAST = "fast",
    FASTER = "faster",
    LOW_PITCH = "low_pitch",
    HIGH_PITCH = "high_pitch",
    NIGHTCORE = "nightcore",
}

export const specialFfmpegArgs = {
    [SpecialType.REVERSE]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "areverse"],
    }),
    [SpecialType.SLOW]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=tempo=0.5"],
    }),
    [SpecialType.FAST]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=tempo=1.5"],
    }),
    [SpecialType.FASTER]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=tempo=2"],
    }),
    [SpecialType.LOW_PITCH]: (seek: number) => ({
        // 3 semitones lower
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=pitch=0.840896"],
    }),
    [SpecialType.HIGH_PITCH]: (seek: number) => ({
        // 4 semitones higher
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=pitch=1.25992"],
    }),
    [SpecialType.NIGHTCORE]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=pitch=1.25992:tempo=1.25"],
    }),
};

export default class SpecialCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.debugServerPrecheck, errorMessage: "This is an unreleased game option, and can only be used on the official KMQ server" }, { checkFn: CommandPrechecks.competitionPrecheck }];

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
        usage: ",special [reverse | slow | fast | faster | low_pitch | high_pitch | nightcore]",
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
                example: "`,special low_pitch`",
                explanation: "Plays the song at a low pitch",
            },
            {
                example: "`,special high_pitch`",
                explanation: "Plays the song at a high pitch",
            },
            {
                example: "`,special nightcore`",
                explanation: "Plays a nightcore edit of the song",
            },
            {
                example: "`,special`",
                explanation: "Reset the special option",
            },
        ],
        priority: 130,
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.SPECIAL_TYPE, reset: true }]);
            logger.info(`${getDebugLogHeader(message)} | Special reset.`);
            return;
        }

        const specialType = parsedMessage.components[0] as SpecialType;
        await guildPreference.setSpecialType(specialType);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, [{ option: GameOption.SPECIAL_TYPE, reset: false }]);
        logger.info(`${getDebugLogHeader(message)} | Special type set to ${specialType}`);
    };
}
