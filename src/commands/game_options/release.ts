import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("release");

export enum ReleaseType {
    OFFICIAL = "official",
    ALL = "all",
}
export const NON_OFFICIAL_VIDEO_TAGS = ["c", "d", "a", "r", "v", "x", "p"];
export const DEFAULT_RELEASE_TYPE = ReleaseType.OFFICIAL;

export default class ReleaseCommand implements BaseCommand {
    aliases = ["releases", "videotype"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "release",
                type: "enum" as const,
                enums: Object.values(ReleaseType),
            },
        ],
    };

    help = (guildID: string): Help => ({
        name: "release",
        description: state.localizer.translate(
            guildID,
            "command.release.help.description"
        ),
        usage: ",release [official | all]",
        examples: [
            {
                example: "`,release official`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.release.help.example.official",
                    { official: `\`${ReleaseType.OFFICIAL}\`` }
                ),
            },
            {
                example: "`,release all`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.release.help.example.all"
                ),
            },
            {
                example: "`,release`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.release.help.example.reset",
                    { defaultRelease: `\`${DEFAULT_RELEASE_TYPE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            guildPreference.reset(GameOption.RELEASE_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.RELEASE_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Video type reset.`);
            return;
        }

        const releaseType =
            parsedMessage.components[0].toLowerCase() as ReleaseType;

        await guildPreference.setReleaseType(releaseType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.RELEASE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Video type set to ${releaseType}`
        );
    };
}
