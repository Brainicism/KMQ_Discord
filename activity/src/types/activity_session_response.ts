import type ActivitySnapshot from "./activity_snapshot";

export default interface ActivitySessionResponse extends ActivitySnapshot {
    /** Discord user locale (e.g. "en-US"). Empty if Discord didn't return one. */
    viewerLocale: string;
}
