import { IPCLogger } from "../../logger";
import { SPOTIFY_BASE_URL } from "../../constants";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { isPremiumRequest } from "../../helpers/game_utils";
import { isValidURL } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LimitCommand from "./limit";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SongSelector from "../../structures/song_selector";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { MatchedPlaylist } from "../../helpers/spotify_manager";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("spotify");

export default class SpotifyCommand implements BaseCommand {
    aliases = ["playlist"];

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "playlist_url",
                type: "string" as const,
            },
        ],
    };

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "playlist_url",
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.spotify.help.interaction.playlistURL"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                },
            ],
        },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "spotify",
        description: i18n.translate(
            guildID,
            "command.spotify.help.description"
        ),
        usage: ",spotify {playlist_url}",
        examples: [
            {
                example: `\`,spotify ${SPOTIFY_BASE_URL}...\``,
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.playlistURL"
                ),
            },
            {
                example: "`,spotify`",
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.reset"
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let playlistURL: string = null;
        if (
            parsedMessage.components.length > 0 &&
            isValidURL(parsedMessage.components[0])
        ) {
            playlistURL = parsedMessage.components[0];
        }

        if (playlistURL || parsedMessage.components.length === 0) {
            await SpotifyCommand.updateOption(
                MessageContext.fromMessage(message),
                playlistURL,
                null,
                playlistURL == null
            );
        } else {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: i18n.translate(
                    message.guildID,
                    "command.spotify.invalidURL.title"
                ),
                description: i18n.translate(
                    message.guildID,
                    "command.spotify.invalidURL.description"
                ),
            });
        }
    };

    static async updateOption(
        messageContext: MessageContext,
        playlistURL: string,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference = await GuildPreference.getGuildPreference(
            guildID
        );

        const gameSession = State.gameSessions[guildID];
        if (reset) {
            await guildPreference.reset(GameOption.SPOTIFY_PLAYLIST_METADATA);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Spotify playlist reset.`
            );
        } else if (
            isValidURL(playlistURL) &&
            new RegExp(`^${SPOTIFY_BASE_URL}.+`).test(playlistURL)
        ) {
            let playlistID = playlistURL.split(SPOTIFY_BASE_URL)[1];
            if (playlistID.includes("?si=")) {
                playlistID = playlistID.split("?si=")[0];
            }

            const premiumRequest = await isPremiumRequest(
                gameSession,
                messageContext.author.id
            );

            if (interaction) {
                await sendInfoMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            guildID,
                            "command.spotify.parsing"
                        ),
                    },
                    false,
                    null,
                    [],
                    interaction
                );

                interaction = null;
            }

            let matchedPlaylist: MatchedPlaylist;
            if (gameSession) {
                matchedPlaylist = await gameSession.songSelector.reloadSongs(
                    guildPreference,
                    premiumRequest,
                    playlistID
                );
            } else {
                matchedPlaylist = await new SongSelector().reloadSongs(
                    guildPreference,
                    premiumRequest,
                    playlistID
                );
            }

            logger.info(
                `${getDebugLogHeader(messageContext)} | Matched ${
                    matchedPlaylist.metadata.matchedSongsLength
                }/${matchedPlaylist.metadata.playlistLength} Spotify songs`
            );

            if (matchedPlaylist.matchedSongs.length === 0) {
                sendErrorMessage(messageContext, {
                    title: i18n.translate(
                        guildID,
                        "command.spotify.noMatches.title"
                    ),
                    description: i18n.translate(
                        guildID,
                        "command.spotify.noMatches.description"
                    ),
                });

                return;
            }

            await guildPreference.setSpotifyPlaylistMetadata(
                matchedPlaylist.metadata
            );

            await LimitCommand.updateOption(
                messageContext,
                0,
                matchedPlaylist.metadata.matchedSongsLength,
                null,
                false
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Spotify playlist set to ${playlistID}`
            );

            await sendInfoMessage(messageContext, {
                title: i18n.translate(
                    guildID,
                    "command.spotify.matched.title",
                    {
                        playlistName: matchedPlaylist.metadata.playlistName,
                    }
                ),
                description: i18n.translate(
                    guildID,
                    "command.spotify.matched.description",
                    {
                        matchedCount: String(
                            matchedPlaylist.matchedSongs.length
                        ),
                        totalCount: String(
                            matchedPlaylist.metadata.playlistLength
                        ),
                    }
                ),
                url: playlistURL,
                thumbnailUrl: matchedPlaylist.metadata.thumbnailUrl,
            });
        } else {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.spotify.invalidURL.title"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.spotify.invalidURL.description"
                    ),
                },
                interaction
            );
            return;
        }

        await sendOptionsMessage(
            Session.getSession(guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SPOTIFY_PLAYLIST_METADATA, reset }],
            null,
            null,
            null,
            interaction
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const playlistURL = interaction.data.options[0]["value"];

        await SpotifyCommand.updateOption(
            messageContext,
            playlistURL,
            interaction,
            playlistURL == null
        );
    }
}
