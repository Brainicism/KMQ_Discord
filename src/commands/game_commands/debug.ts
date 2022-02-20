import Eris from "eris";
import * as uuid from "uuid";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    getDebugChannel,
    sendInfoMessage,
    getUserVoiceChannel,
    getDebugLogHeader,
    getGuildLocale,
} from "../../helpers/discord_utils";
import {
    getGuildPreference,
    getAvailableSongCount,
    isPremiumRequest,
} from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("debug");

export default class DebugCommand implements BaseCommand {
    call = async ({ message, channel }: CommandArgs): Promise<void> => {
        const debugChannel = await getDebugChannel();
        if (!debugChannel) {
            logger.warn("No debug text channel specified");
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);

        const songCount = await getAvailableSongCount(
            guildPreference,
            await isPremiumRequest(message.guildID, message.author.id)
        );

        const fields: Array<Eris.EmbedField> = [];
        fields.push({
            name: "Guild Preference",
            value: JSON.stringify(guildPreference.gameOptions),
            inline: false,
        });

        fields.push({
            name: "Song Count",
            value: `${songCount.count.toString()}/${songCount.countBeforeLimit.toString()}`,
            inline: false,
        });

        fields.push({
            name: "Text Permissions",
            value: JSON.stringify(
                channel.permissionsOf(process.env.BOT_CLIENT_ID).json
            ),
            inline: false,
        });

        fields.push({
            name: "Locale",
            value: getGuildLocale(message.guildID),
            inline: false,
        });

        const voiceChannel = getUserVoiceChannel(
            MessageContext.fromMessage(message)
        );

        if (voiceChannel) {
            fields.push({
                name: "Voice Permissions",
                value: JSON.stringify(
                    voiceChannel.permissionsOf(process.env.BOT_CLIENT_ID).json
                ),
                inline: false,
            });
        }

        const debugID = uuid.v4();
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "command.debug.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.debug.description",
                {
                    debugID: `\`${debugID}\``,
                }
            ),
            thumbnailUrl: KmqImages.READING_BOOK,
        });

        await sendInfoMessage(new MessageContext(debugChannel.id), {
            title: `Debug Details for User: ${message.author.id}, Guild: ${message.guildID}`,
            footerText: debugID,
            fields,
            timestamp: new Date(),
        });

        logger.info(`${getDebugLogHeader(message)} | Debug info retrieved.`);
    };
}
