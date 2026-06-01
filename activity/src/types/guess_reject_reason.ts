type GuessRejectReason =
    | "no_session"
    | "maintenance"
    | "banned"
    | "rate_limit"
    | "not_in_vc"
    | "bot_no_voice_perms"
    | "internal"
    | "unauthorized"
    | "forbidden"
    | "bad_request"
    | "session_already_running"
    | "no_round"
    | "hint_unavailable"
    | "song_not_found"
    | "playlist_invalid_url"
    | "playlist_unsupported_url"
    | "playlist_no_matches"
    | "playlist_resolve_failed";

export default GuessRejectReason;
