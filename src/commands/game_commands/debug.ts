import Eris from "eris";
import * as uuid from "uuid";

import { KmqImages } from "../../constants";
import {
    getDebugChannel,
    getDebugLogHeader,
    getGuildLocale,
    getUserVoiceChannel,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import {
    getAvailableSongCount,
    getGuildPreference,
    isPremiumRequest,
} from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";

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
            inline: false,
            name: "Guild Preference",
            value: JSON.stringify(guildPreference.gameOptions),
        });

        fields.push({
            inline: false,
            name: "Song Count",
            value: `${songCount.count.toString()}/${songCount.countBeforeLimit.toString()}`,
        });

        fields.push({
            inline: false,
            name: "Text Permissions",
            value: JSON.stringify(
                channel.permissionsOf(process.env.BOT_CLIENT_ID).json
            ),
        });

        fields.push({
            inline: false,
            name: "Locale",
            value: getGuildLocale(message.guildID),
        });

        const voiceChannel = getUserVoiceChannel(
            MessageContext.fromMessage(message)
        );

        if (voiceChannel) {
            fields.push({
                inline: false,
                name: "Voice Permissions",
                value: JSON.stringify(
                    voiceChannel.permissionsOf(process.env.BOT_CLIENT_ID).json
                ),
            });
        }

        const debugID = uuid.v4();
        await sendInfoMessage(MessageContext.fromMessage(message), {
            description: state.localizer.translate(
                message.guildID,
                "command.debug.description",
                {
                    debugID: `\`${debugID}\``,
                }
            ),
            thumbnailUrl: KmqImages.READING_BOOK,
            title: state.localizer.translate(
                message.guildID,
                "command.debug.title"
            ),
        });

        await sendInfoMessage(new MessageContext(debugChannel.id), {
            fields,
            footerText: debugID,
            timestamp: new Date(),
            title: `Debug Details for User: ${message.author.id}, Guild: ${message.guildID}`,
        });

        logger.info(`${getDebugLogHeader(message)} | Debug info retrieved.`);
    };
}
