import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import { GameOption } from "../../types";

const logger = _logger("release");

export enum ReleaseType {
    OFFICIAL = "official",
    ALL = "all",
}
export const NON_OFFICIAL_VIDEO_TAGS = ["c", "d", "a", "r", "v", "x", "p"];
export const DEFAULT_RELEASE_TYPE = ReleaseType.OFFICIAL;

export default class ReleaseCommand implements BaseCommand {
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

    help = {
        name: "release",
        description: "Choose whether to include only official music videos, or all videos (covers, dance practices, acoustic versions, remixes, etc)",
        usage: "!release [release]",
        examples: [
            {
                example: "`!release official`",
                explanation: "Plays only `official` music videos",
            },
            {
                example: "`!release all`",
                explanation: "Plays all available videos, including covers, dance practices, acoustic versions, remixes",
            },
            {
                example: "`!release`",
                explanation: `Reset to the default release type of \`${DEFAULT_RELEASE_TYPE}\``,
            },
        ],
        priority: 130,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            guildPreference.resetReleaseType();
            logger.info(`${getDebugLogHeader(message)} | Video type reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.RELEASE_TYPE, reset: true });
            return;
        }

        const releaseType = parsedMessage.components[0].toLowerCase() as ReleaseType;
        guildPreference.setReleaseType(releaseType);
        await sendOptionsMessage(message, guildPreference, { option: GameOption.RELEASE_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Video type set to ${releaseType}`);
    }
}
