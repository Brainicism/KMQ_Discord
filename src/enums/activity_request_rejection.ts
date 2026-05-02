type ActivityRequestRejection =
    | "no_session"
    | "maintenance"
    | "banned"
    | "rate_limit"
    | "not_in_vc"
    | "internal"
    | "session_already_running"
    | "no_round"
    | "hint_unavailable"
    | "song_not_found";

export default ActivityRequestRejection;
