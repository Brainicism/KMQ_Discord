import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import {
    chunkArray,
    discordDateFormat,
    friendlyFormattedNumber,
} from "../../helpers/utils";
import {
    getDebugLogHeader,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils";
import {
    getLocalizedArtistName,
    getLocalizedSongName,
} from "../../helpers/game_utils";
import Eris from "eris";
import KmqMember from "../../structures/kmq_member";
import MessageContext from "../../structures/message_context";
import SongSelector from "../../structures/song_selector";
import State from "../../state";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import type { CommandInteraction, EmbedOptions } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type QueriedSong from "../../interfaces/queried_song";

const logger = new IPCLogger("recentlyadded");

const FIELDS_PER_EMBED = 9;

export default class RecentlyAddedCommand implements BaseCommand {
    aliases = ["recent"];

    help = (guildID: string): HelpDocumentation => ({
        name: "recentlyadded",
        description: i18n.translate(
            guildID,
            "command.recentlyadded.help.description",
        ),
        usage: "/recentlyadded",
        examples: [
            {
                example: "`/recentlyadded`",
                explanation: i18n.translate(
                    guildID,
                    "command.recentlyadded.help.example",
                ),
            },
        ],
        priority: 30,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await RecentlyAddedCommand.showRecentlyAddedSongs(message);
    };

    static async showRecentlyAddedSongs(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
    ): Promise<void> {
        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member!.id),
            messageOrInteraction.guildID as string,
        );

        const newSongs: Array<QueriedSong> = await dbContext.kmq
            .selectFrom("available_songs")
            .select(SongSelector.QueriedSongFields)
            .orderBy("publishedon", "desc")
            .where(
                "publishedon",
                ">=",
                new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
            )
            .execute();

        if (newSongs.length === 0) {
            sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.recentlyadded.failure.noSongs.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.recentlyadded.failure.noSongs.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                false,
                undefined,
                [],
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
            );
            return;
        }

        const locale = State.getGuildLocale(messageContext.guildID);
        const fields = newSongs.map((song) => ({
            name: `"${getLocalizedSongName(
                song,
                locale,
            )}" - ${getLocalizedArtistName(song, locale)}`,
            value: `${discordDateFormat(
                song.publishDate,
                "d",
            )}\n[${friendlyFormattedNumber(song.views)} ${i18n.translate(
                messageContext.guildID,
                "misc.views",
            )}](https://youtu.be/${song.youtubeLink})`,
            inline: true,
        }));

        const embedFieldSubsets = chunkArray(fields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                title: i18n.translate(
                    messageContext.guildID,
                    "command.recentlyadded.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.recentlyadded.description",
                ),
                fields: embedFieldsSubset,
            }),
        );

        await sendPaginationedEmbed(messageOrInteraction, embeds, undefined);
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Recently added songs retrieved.`,
        );
    }

    /**
     * @param interaction - The interaction
     * @param _messageContext - Unused
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        _messageContext: MessageContext,
    ): Promise<void> {
        await RecentlyAddedCommand.showRecentlyAddedSongs(interaction);
    }
}
