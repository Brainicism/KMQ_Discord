import BaseCommand, { CommandArgs } from "../interfaces/base_command";
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
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["releases", "videotype"];

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

    help = (guildID: string) => ({
            name: "release",
            description: state.localizer.translate(guildID,
                "Choose whether to include only official music videos, or all videos (b-sides, dance practices, acoustic versions, remixes, etc.)."
            ),
            usage: ",release [official | all]",
            examples: [
                {
                    example: "`,release official`",
                    explanation: state.localizer.translate(guildID,
                        "Plays only {{{official}}} music videos",
                        { official: `\`${ReleaseType.OFFICIAL}\`` }
                    ),
                },
                {
                    example: "`,release all`",
                    explanation: state.localizer.translate(guildID,
                        "Plays all available videos, including dance practices, acoustic versions, remixes"
                    ),
                },
                {
                    example: "`,release`",
                    explanation: state.localizer.translate(guildID,
                        "Reset to the default release type of {{{defaultRelease}}}",
                        { defaultRelease: `\`${DEFAULT_RELEASE_TYPE}\`` }
                    ),
                },
            ],
        });

    helpPriority = 130;
    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.RELEASE_TYPE);
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
