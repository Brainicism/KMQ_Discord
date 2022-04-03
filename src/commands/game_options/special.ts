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

const logger = new IPCLogger("special");

export enum SpecialType {
    REVERSE = "reverse",
    SLOW = "slow",
    FAST = "fast",
    FASTER = "faster",
    LOW_PITCH = "lowpitch",
    HIGH_PITCH = "highpitch",
    NIGHTCORE = "nightcore",
}

export const specialFfmpegArgs = {
    [SpecialType.REVERSE]: (seek: number) => ({
        encoderArgs: ["-af", "areverse"],
        inputArgs: ["-ss", seek.toString()],
    }),
    [SpecialType.SLOW]: (seek: number) => ({
        encoderArgs: ["-af", "rubberband=tempo=0.5"],
        inputArgs: ["-ss", seek.toString()],
    }),
    [SpecialType.FAST]: (seek: number) => ({
        encoderArgs: ["-af", "rubberband=tempo=1.5"],
        inputArgs: ["-ss", seek.toString()],
    }),
    [SpecialType.FASTER]: (seek: number) => ({
        encoderArgs: ["-af", "rubberband=tempo=2"],
        inputArgs: ["-ss", seek.toString()],
    }),
    [SpecialType.LOW_PITCH]: (seek: number) => ({
        encoderArgs: ["-af", "rubberband=pitch=0.840896"],
        // 3 semitones lower
        inputArgs: ["-ss", seek.toString()],
    }),
    [SpecialType.HIGH_PITCH]: (seek: number) => ({
        encoderArgs: ["-af", "rubberband=pitch=1.25992"],
        // 4 semitones higher
        inputArgs: ["-ss", seek.toString()],
    }),
    [SpecialType.NIGHTCORE]: (seek: number) => ({
        encoderArgs: ["-af", "rubberband=pitch=1.25992:tempo=1.25"],
        inputArgs: ["-ss", seek.toString()],
    }),
};

export default class SpecialCommand implements BaseCommand {
    preRunChecks = [
        {
            checkFn: CommandPrechecks.debugServerPrecheck,
            errorMessage:
                "This is an unreleased game option, and can only be used on the official KMQ server",
        },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    validations = {
        arguments: [
            {
                enums: Object.values(SpecialType),
                name: "specialType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.special.help.description"
        ),
        examples: [
            {
                example: "`,special reverse`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.reverse"
                ),
            },
            {
                example: "`,special slow`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.slow"
                ),
            },
            {
                example: "`,special fast`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.fast"
                ),
            },
            {
                example: "`,special faster`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.faster"
                ),
            },
            {
                example: "`,special lowpitch`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.lowPitch"
                ),
            },
            {
                example: "`,special highpitch`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.highPitch"
                ),
            },
            {
                example: "`,special nightcore`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.nightcore"
                ),
            },
            {
                example: "`,special`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.special.help.example.reset"
                ),
            },
        ],
        name: "special",
        priority: 130,
        usage: ",special [reverse | slow | fast | faster | lowpitch | highpitch | nightcore]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.SPECIAL_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.SPECIAL_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Special reset.`);
            return;
        }

        const specialType = parsedMessage.components[0] as SpecialType;
        await guildPreference.setSpecialType(specialType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.SPECIAL_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Special type set to ${specialType}`
        );
    };
}
