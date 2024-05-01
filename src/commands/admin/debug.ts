import * as uuid from "uuid";
import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    getUserVoiceChannel,
    sendInfoEmbedsWebhook,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type Eris from "eris";

const logger = new IPCLogger("debug");

// eslint-disable-next-line import/no-unused-modules
export default class DebugCommand implements BaseCommand {
    call = async ({ message, channel }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID,
        );

        const messageContext = MessageContext.fromMessage(message);
        const { count, countBeforeLimit } =
            await guildPreference.getAvailableSongCount();

        const fields: Array<Eris.EmbedField> = [];
        fields.push({
            name: "Guild Preference",
            value: JSON.stringify(guildPreference.gameOptions),
            inline: false,
        });

        fields.push({
            name: "Song Count",
            value: `${(count ?? "undefined").toString()}/${(
                countBeforeLimit ?? "undefined"
            ).toString()}`,
            inline: false,
        });

        fields.push({
            name: "Text Permissions",
            value: JSON.stringify(
                channel.permissionsOf(process.env.BOT_CLIENT_ID as string).json,
            ),
            inline: false,
        });

        fields.push({
            name: "Locale",
            value: State.getGuildLocale(message.guildID),
            inline: false,
        });

        const voiceChannel = getUserVoiceChannel(messageContext);

        if (voiceChannel) {
            fields.push({
                name: "Voice Permissions",
                value: JSON.stringify(
                    voiceChannel.permissionsOf(
                        process.env.BOT_CLIENT_ID as string,
                    ).json,
                ),
                inline: false,
            });
        }

        const debugID = uuid.v4();
        await sendInfoMessage(messageContext, {
            title: i18n.translate(message.guildID, "command.debug.title"),
            description: i18n.translate(
                message.guildID,
                "command.debug.description",
                {
                    debugID: `\`${debugID}\``,
                },
            ),
            thumbnailUrl: KmqImages.READING_BOOK,
        });

        await sendInfoEmbedsWebhook(
            process.env.DEBUG_CHANNEL_WEBHOOK_URL!,
            {
                title: `Debug Details for User: ${message.author.id}, Guild: ${message.guildID}`,
                footerText: debugID,
                fields,
                timestamp: new Date(),
            },
            undefined,
        );

        logger.info(`${getDebugLogHeader(message)} | Debug info retrieved.`);
    };
}
