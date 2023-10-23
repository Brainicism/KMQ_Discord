import { IPCLogger } from "../../logger";
import { OptionAction, SPOTIFY_BASE_URL } from "../../constants";
import {
    friendlyFormattedNumber,
    isValidURL,
    italicize,
} from "../../helpers/utils";
import {
    generateEmbed,
    generateOptionsMessage,
    getDebugLogHeader,
    getInteractionValue,
    notifyOptionsGenerationError,
    sendErrorMessage,
    sendInfoMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { isPremiumRequest } from "../../helpers/game_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LimitCommand from "./limit";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SongSelector from "../../structures/song_selector";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { MatchedPlaylist } from "../../interfaces/matched_playlist";
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
                    name: OptionAction.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.spotify.help.description"
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.spotify.help.description"
                                ),
                            }),
                            {}
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "playlist_url",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.spotify.help.interaction.playlistURL"
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.spotify.help.interaction.playlistURL"
                                        ),
                                    }),
                                    {}
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "spotify" }
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "spotify" }
                                ),
                            }),
                            {}
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
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
        usage: "/spotify set\nplaylist_url:{playlist_url}\n\n/spotify reset",
        examples: [
            {
                example: `\`/spotify playlist_url:${SPOTIFY_BASE_URL}...\``,
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.playlistURL"
                ),
            },
            {
                example: "`/spotify`",
                explanation: i18n.translate(
                    guildID,
                    "command.spotify.help.example.reset"
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let playlistURL: string | undefined;
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
                undefined,
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
        playlistURL?: string,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildID = messageContext.guildID;
        const guildPreference =
            await GuildPreference.getGuildPreference(guildID);

        const session = Session.getSession(guildID);
        if (reset) {
            await guildPreference.reset(GameOption.SPOTIFY_PLAYLIST_ID);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Spotify playlist reset.`
            );

            await sendOptionsMessage(
                session,
                messageContext,
                guildPreference,
                [{ option: GameOption.SPOTIFY_PLAYLIST_ID, reset }],
                false,
                undefined,
                undefined,
                interaction
            );
            return;
        }

        if (!playlistURL) {
            logger.error("playlistURL unexpectedly undefined");
            return;
        }

        if (
            isValidURL(playlistURL) &&
            new RegExp(`^${SPOTIFY_BASE_URL}.+`).test(playlistURL)
        ) {
            let playlistID = playlistURL.split(SPOTIFY_BASE_URL)[1];
            if (playlistID.includes("?si=")) {
                playlistID = playlistID.split("?si=")[0];
            }

            const premiumRequest = await isPremiumRequest(
                session,
                messageContext.author.id
            );

            let matchedPlaylist: MatchedPlaylist;
            if (session) {
                matchedPlaylist = (await session.songSelector.reloadSongs(
                    guildPreference,
                    premiumRequest,
                    playlistID,
                    true,
                    messageContext,
                    interaction
                )) as MatchedPlaylist;
            } else {
                matchedPlaylist = (await new SongSelector().reloadSongs(
                    guildPreference,
                    premiumRequest,
                    playlistID,
                    true,
                    messageContext,
                    interaction
                )) as MatchedPlaylist;
            }

            logger.info(
                `${getDebugLogHeader(messageContext)} | Matched ${
                    matchedPlaylist.metadata.matchedSongsLength
                }/${matchedPlaylist.metadata.playlistLength} (${(
                    (100.0 * matchedPlaylist.metadata.matchedSongsLength) /
                    matchedPlaylist.metadata.playlistLength
                ).toFixed(2)}%) Spotify songs`
            );

            if (matchedPlaylist.matchedSongs.length === 0) {
                sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            guildID,
                            "command.spotify.noMatches.title"
                        ),
                        description: i18n.translate(
                            guildID,
                            "command.spotify.noMatches.description"
                        ),
                    },
                    interaction
                );

                return;
            }

            await guildPreference.setSpotifyPlaylistID(playlistID);

            await LimitCommand.updateOption(
                messageContext,
                0,
                matchedPlaylist.metadata.matchedSongsLength,
                undefined,
                false
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Spotify playlist set to ${playlistID}`
            );

            let matchedDescription = i18n.translate(
                guildID,
                "command.spotify.matched.description",
                {
                    matchedCount: friendlyFormattedNumber(
                        matchedPlaylist.matchedSongs.length
                    ),
                    totalCount: friendlyFormattedNumber(
                        matchedPlaylist.metadata.playlistLength
                    ),
                }
            );

            if (matchedPlaylist.truncated) {
                matchedDescription += "\n\n";
                matchedDescription += italicize(
                    i18n.translate(guildID, "command.spotify.matched.truncated")
                );
            }

            await sendInfoMessage(messageContext, {
                title: i18n.translate(
                    guildID,
                    "command.spotify.matched.title",
                    {
                        playlistName: matchedPlaylist.metadata.playlistName,
                    }
                ),
                description: matchedDescription,
                url: playlistURL,
                thumbnailUrl:
                    matchedPlaylist.metadata.thumbnailUrl ?? undefined,
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

        if (interaction?.acknowledged) {
            const optionsEmbed = await generateOptionsMessage(
                session,
                messageContext,
                guildPreference,
                [{ option: GameOption.SPOTIFY_PLAYLIST_ID, reset }],
                false,
                undefined,
                undefined,
                interaction
            );

            if (optionsEmbed) {
                await interaction.createFollowup({
                    embeds: [generateEmbed(messageContext, optionsEmbed)],
                });
            } else {
                await notifyOptionsGenerationError(messageContext, "spotify");
            }
        } else {
            await sendOptionsMessage(
                session,
                messageContext,
                guildPreference,
                [{ option: GameOption.SPOTIFY_PLAYLIST_ID, reset }],
                false,
                undefined,
                undefined,
                interaction
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        let playlistURL: string | undefined;
        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            playlistURL = undefined;
        } else if (action === OptionAction.SET) {
            playlistURL = encodeURI(interactionOptions["playlist_url"]);
        }

        await SpotifyCommand.updateOption(
            messageContext,
            playlistURL,
            interaction,
            playlistURL == null
        );
    }
}
