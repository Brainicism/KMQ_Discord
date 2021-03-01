import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader, getMessageContext, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

const logger = _logger("artisttype");
export enum ArtistType {
    SOLOIST = "soloists",
    GROUP = "groups",
    BOTH = "both",
}

export const DEFAULT_ARTIST_TYPE = ArtistType.BOTH;

export default class ArtistTypeCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "artist_Type",
                type: "enum" as const,
                enums: Object.values(ArtistType),
            },
        ],
    };

    help = {
        name: "artisttype",
        description: "Choose whether you'd like to hear from soloists, groups, or both. Options are the following, `soloists`, `groups`, and `both`.",
        usage: "!artisttype [artisttype]",
        examples: [
            {
                example: "`!artisttype soloists`",
                explanation: "Play songs only from `soloists`",
            },
            {
                example: "`!artisttype groups`",
                explanation: "Play songs only from `groups`",
            },
            {
                example: "`!artisttype both`",
                explanation: "Plays songs from both `soloists` and `groups`",
            },
            {
                example: "`!artisttype`",
                explanation: "Resets the artist type option",
            },
        ],
        priority: 150,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetArtistType();
            logger.info(`${getDebugLogHeader(message)} | Artist type reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.ARTIST_TYPE, reset: true });
            return;
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between artist type and groups.`);
            sendErrorMessage(getMessageContext(message), { title: "Game Option Conflict", description: `\`groups\` game option is currently set. \`artisttype\` and \`groups\` are incompatible. Remove the \`groups\` option by typing \`${process.env.BOT_PREFIX}groups\` to proceed` });
            return;
        }

        const artistType = parsedMessage.components[0] as ArtistType;
        guildPreference.setArtistType(artistType);
        await sendOptionsMessage(message, guildPreference, { option: GameOption.ARTIST_TYPE, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Artist type set to ${artistType}`);
    }
}
