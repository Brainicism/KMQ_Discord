import Eris from "eris";
import * as uuid from "uuid";
import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugChannel, sendInfoMessage, getVoiceChannelFromMessage } from "../../helpers/discord_utils";
import { getGuildPreference, getSongCount } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import state from "../../kmq";
import _logger from "../../logger";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";

const logger = _logger("debug");

export default class DebugCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const debugChannel = getDebugChannel();
        if (!debugChannel) {
            logger.warn("No debug text channel specified");
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
        const songCount = await getSongCount(guildPreference);
        const fields: Array<Eris.EmbedField> = [];
        fields.push({
            name: "Guild Preference",
            value: JSON.stringify(guildPreference),
            inline: false,
        });

        fields.push({
            name: "Song Count",
            value: `${songCount.count.toString()}/${songCount.countBeforeLimit.toString()}`,
            inline: false,
        });

        fields.push({
            name: "Text Permissions",
            value: JSON.stringify(message.channel.permissionsOf(state.client.user.id).json),
            inline: false,
        });

        const voiceChannel = getVoiceChannelFromMessage(message);
        if (voiceChannel) {
            fields.push({
                name: "Voice Permissions",
                value: JSON.stringify(voiceChannel.permissionsOf(state.client.user.id).json),
                inline: false,
            });
        }

        const debugID = uuid.v4();
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Debug Details Sent!",
            description: `If you were asked by a bot developer to do this, give them this:\n\`${debugID}\``,
            thumbnailUrl: KmqImages.READING_BOOK,
        });
        sendInfoMessage(new MessageContext(debugChannel.id), {
            title: bold(`Debug Details for User: ${message.author.id}, Guild: ${message.guildID}`),
            footerText: debugID,
            fields,
            timestamp: new Date(),
        });
    }
}
