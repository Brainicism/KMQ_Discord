import type ActivityRequestRejection from "../enums/activity_request_rejection";

export default interface ActivityBookmarkResponse {
    ok: boolean;
    reason?: ActivityRequestRejection;
    songName?: string;
    artistName?: string;
    /** Always returned on success so the client can update its local set. */
    youtubeLink?: string;
}
