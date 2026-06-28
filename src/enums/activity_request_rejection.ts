type ActivityRequestRejection =
    | "no_session"
    | "maintenance"
    | "banned"
    | "rate_limit"
    | "not_in_vc"
    | "bot_no_voice_perms"
    | "internal"
    | "session_already_running"
    | "no_round"
    | "hint_unavailable"
    | "invalid_emote"
    | "song_not_found"
    // Playlist set failures (POST /api/activity/option, kind="playlist").
    | "playlist_invalid_url"
    | "playlist_unsupported_url"
    | "playlist_no_matches"
    | "playlist_resolve_failed";

export default ActivityRequestRejection;
