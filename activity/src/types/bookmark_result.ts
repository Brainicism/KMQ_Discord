import type GuessRejectReason from "./guess_reject_reason";

export default interface BookmarkResult {
    ok: boolean;
    reason?: GuessRejectReason;
    songName?: string;
    artistName?: string;
    youtubeLink?: string;
}
