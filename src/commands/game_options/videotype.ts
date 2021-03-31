import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import { GameOption } from "../../types";

const logger = _logger("videotype");

export enum VideoType {
    OFFICIAL = "official",
    ALL = "all",
}
export const NON_OFFICIAL_VIDEO_TAGS = ["c", "d", "a", "r", "v", "x", "p"];
export const DEFAULT_VIDEO_TYPE = VideoType.OFFICIAL;

export default class VideoTypeCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "videoType",
                type: "enum" as const,
                enums: Object.values(VideoType),
            },
        ],
    };

    help = {
        name: "videotype",
        description: "Choose whether to include only official music videos, or all videos (covers, dance practices, acoustic versions, remixes, etc)",
        usage: "!videotype [videoType]",
        examples: [
            {
                example: "`!videotype official`",
                explanation: "Plays only `official` music videos",
            },
            {
                example: "`!videotype all`",
                explanation: "Plays all available videos, including covers, dance practices, acoustic versions, remixes",
            },
            {
                example: "`!videotype`",
                explanation: `Reset to the default videotype of \`${DEFAULT_VIDEO_TYPE}\``,
            },
        ],
        priority: 130,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            guildPreference.resetVideoType();
            logger.info(`${getDebugLogHeader(message)} | Video type reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.VIDEO_TYPE, reset: true });
            return;
        }

        const videoType = parsedMessage.components[0].toLowerCase() as VideoType;
        guildPreference.setVideoType(videoType);
        await sendOptionsMessage(message, guildPreference, { option: GameOption.VIDEO_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Video type set to ${videoType}`);
    }
}
