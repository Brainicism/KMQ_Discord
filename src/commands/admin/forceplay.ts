import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    getDebugChannel, getDebugLogHeader, sendErrorMessage, sendOptionsMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameOption } from "../../types";

const logger = new IPCLogger("forceplay");

export default class ForcePlayCommand implements BaseCommand {
    call = async ({ message, parsedMessage }: CommandArgs) => {
        const kmqDebugChannel = getDebugChannel();
        if (!kmqDebugChannel || message.channel.id !== kmqDebugChannel.id) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error", description: "You are not allowed to forceplay in this channel" });
            logger.warn(`${getDebugLogHeader(message)} | Attempted to forceplay in non-debug channel`);
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.FORCE_PLAY_SONG);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.FORCE_PLAY_SONG, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Force play song reset.`);
            return;
        }

        const forcePlaySongID = parsedMessage.components[0];
        await guildPreference.setForcePlaySong(forcePlaySongID);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.FORCE_PLAY_SONG, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Force play song set to ${guildPreference.gameOptions.forcePlaySongID}`);
    };
}
