import { IPCLogger } from "../logger";
import { SPOTIFY_BASE_URL, SPOTIFY_SHORTHAND_BASE_URL } from "../constants";
import { isValidURL } from "./utils";
import GameOption from "../enums/game_option_name";
import _ from "lodash";
import type { MatchedPlaylist } from "../interfaces/matched_playlist";
import type Eris from "eris";
import type GuildPreference from "../structures/guild_preference";
import type MessageContext from "../structures/message_context";

const logger = new IPCLogger("playlist_utils");

/** Why a playlist couldn't be applied. Maps 1:1 to user-facing messages. */
type PlaylistFailureReason =
    | "invalid_url"
    | "unsupported_url"
    | "no_matches"
    | "resolve_failed";

type PlaylistType = "spotify" | "youtube";

/**
 * Result of resolving a playlist URL down to a KMQ playlist identifier
 * (`spotify|<id>` / `youtube|<id>`), before any song matching.
 */
type DeriveResult =
    | { ok: true; type: PlaylistType; identifier: string }
    | { ok: false; reason: Exclude<PlaylistFailureReason, "no_matches"> };

/** Result of applying (deriving + matching) a playlist URL to a guild. */
type PlaylistApplyResult =
    | {
          ok: true;
          type: PlaylistType;
          identifier: string;
          matchedPlaylist: MatchedPlaylist;
      }
    | { ok: false; reason: PlaylistFailureReason };

/**
 * Validate a playlist URL and resolve it to a KMQ playlist identifier. Pure
 * (no Discord I/O) so both the `/playlist` slash command and the Activity
 * can share it. Spotify shorthand links require a network fetch to expand.
 * @param playlistURL - The raw Spotify/YouTube playlist URL.
 * @returns the derived identifier + type, or a failure reason.
 */
async function deriveKmqPlaylistIdentifier(
    playlistURL: string,
): Promise<DeriveResult> {
    if (!playlistURL || !isValidURL(playlistURL)) {
        return { ok: false, reason: "invalid_url" };
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(playlistURL);
    } catch {
        return { ok: false, reason: "invalid_url" };
    }

    // Escape the URL constants before embedding them in a RegExp — their
    // unescaped dots (e.g. "open.spotify.com") would otherwise match any
    // character, letting look-alike hosts slip through (CodeQL
    // js/incomplete-hostname-regexp).
    const isSpotifyFullURL = new RegExp(
        `^${_.escapeRegExp(SPOTIFY_BASE_URL)}.+`,
    ).test(playlistURL);

    const isSpotifyShorthandURL = new RegExp(
        `^${_.escapeRegExp(SPOTIFY_SHORTHAND_BASE_URL)}.+`,
    ).test(playlistURL);

    const isYoutubePlaylistURL =
        ["www.youtube.com", "youtube.com", "music.youtube.com"].includes(
            parsedUrl.host,
        ) && parsedUrl.searchParams.get("list");

    if (!isSpotifyFullURL && !isSpotifyShorthandURL && !isYoutubePlaylistURL) {
        return { ok: false, reason: "unsupported_url" };
    }

    const matchPlaylistID = `${_.escapeRegExp(SPOTIFY_BASE_URL)}([a-zA-Z0-9]+)`;
    try {
        if (isSpotifyFullURL) {
            return {
                ok: true,
                type: "spotify",
                identifier: `spotify|${playlistURL.match(matchPlaylistID)![1]}`,
            };
        } else if (isSpotifyShorthandURL) {
            const response = await fetch(playlistURL);
            const body = await response.text();
            return {
                ok: true,
                type: "spotify",
                identifier: `spotify|${body.match(matchPlaylistID)![1]}`,
            };
        }

        return {
            ok: true,
            type: "youtube",
            identifier: `youtube|${parsedUrl.searchParams.get("list")}`,
        };
    } catch (err) {
        logger.error(
            `Failed to derive playlist ID from URL. playlistURL = ${playlistURL}. err = ${err}`,
        );
        return { ok: false, reason: "resolve_failed" };
    }
}

/**
 * Resolve a playlist URL, persist it on the guild preference, and match its
 * songs against the KMQ library. On zero matches the playlist is reset so the
 * guild isn't left pinned to an empty set. Does not set the song limit or send
 * any messages — callers handle those (slash sends embeds; Activity sets the
 * limit + broadcasts).
 * @param guildPreference - The guild's preference to mutate.
 * @param playlistURL - The raw Spotify/YouTube playlist URL.
 * @param messageContext - Optional; lets the matcher post progress (slash only).
 * @param interaction - Optional; lets the matcher post progress (slash only).
 * @returns the matched playlist + identifier, or a failure reason.
 */
export default async function applyPlaylistFromURL(
    guildPreference: GuildPreference,
    playlistURL: string,
    messageContext?: MessageContext,
    interaction?: Eris.CommandInteraction,
): Promise<PlaylistApplyResult> {
    const derived = await deriveKmqPlaylistIdentifier(playlistURL);
    if (!derived.ok) {
        return derived;
    }

    await guildPreference.setKmqPlaylistID(derived.identifier);
    const matchedPlaylist = await guildPreference.songSelector.reloadSongs(
        true,
        messageContext,
        interaction,
    );

    if (!matchedPlaylist || matchedPlaylist.matchedSongs.length === 0) {
        if (!matchedPlaylist) {
            logger.warn(
                `matchedPlaylist unexpectedly null after set. identifier = ${derived.identifier} forceplay = ${guildPreference.gameOptions.forcePlaySongID}`,
            );
        }

        await guildPreference.reset(GameOption.PLAYLIST_ID);
        return { ok: false, reason: "no_matches" };
    }

    return {
        ok: true,
        type: derived.type,
        identifier: derived.identifier,
        matchedPlaylist,
    };
}
