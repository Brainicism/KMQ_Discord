import Eris from "eris";
import * as uuid from "uuid";
import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugChannel, getVoiceChannel, sendEmbed, sendInfoMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import state from "../../kmq";
import _logger from "../../logger";

const logger = _logger("debug");

export default class DebugCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const debugChannel = getDebugChannel();
        if (!debugChannel) {
            logger.warn("No debug text channel specified");
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
        const fields: Array<Eris.EmbedField> = [];
        fields.push({
            name: "Guild Preference",
            value: JSON.stringify(guildPreference),
            inline: false,
        });

        fields.push({
            name: "Text Permissions",
            value: JSON.stringify(message.channel.permissionsOf(state.client.user.id).json),
            inline: false,
        });

        const voiceChannel = getVoiceChannel(message);
        if (voiceChannel) {
            fields.push({
                name: "Voice Permissions",
                value: JSON.stringify(voiceChannel.permissionsOf(state.client.user.id).json),
                inline: false,
            });
        }

        const debugId = uuid.v4();
        sendInfoMessage(message, "Debug Details Sent!", `If you were asked by a bot developer to do this, give them this:\n\`${debugId}\``);
        sendEmbed({ channel: debugChannel, authorId: message.author.id }, {
            title: bold(`Debug Details for User: ${message.author.id}, Guild: ${message.guildID}`),
            footer: {
                text: debugId,
            },
            fields,
            timestamp: new Date(),
        });
    }
}
