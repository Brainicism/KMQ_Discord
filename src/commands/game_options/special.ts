import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference, isUserPremium } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import GuildPreference from "../../structures/guild_preference";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";

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
    preRunChecks = [
        {
            checkFn: CommandPrechecks.debugServerPrecheck,
            errorMessage:
                "This is an unreleased game option, and can only be used on the official KMQ server",
        },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

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

    help = (guildID: string): Help => ({
        name: "special",
        description: state.localizer.translate(
            guildID,
            "command.special.help.description"
        ),
        usage: ",special [reverse | slow | fast | faster | lowpitch | highpitch | nightcore]",
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
        priority: 130,
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

        if (
            process.env.DEBUG_SERVER_ID !== message.guildID &&
            !(await isUserPremium(message.author.id))
        ) {
            sendErrorMessage(MessageContext.fromMessage(message), {
                description:
                    "This option can only be used by premium KMQ supporters, or in the official KMQ server.",
                title: "Premium Option",
            });
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

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        await guildPreference.reset(GameOption.SPECIAL_TYPE);
    };
}
