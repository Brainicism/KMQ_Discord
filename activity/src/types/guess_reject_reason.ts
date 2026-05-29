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
    | "song_not_found";

export default GuessRejectReason;
