/**
 * Account-level EXP buffs that apply regardless of the active game's options
 * (i.e. not the per-round / per-option penalties). Surfaced on the profile
 * card; raw flags so the client localizes + renders them.
 */
interface ActivityProfileBuffs {
    /** Power hour or weekend bonus active (global, time-based). */
    powerHour: boolean;
    /** The player hasn't played yet today (their next game earns the bonus). */
    firstGameOfDay: boolean;
    /** A top.gg vote bonus is currently active for this player. */
    voteBonusActive: boolean;
    /** Epoch ms when the vote bonus expires, or null when not active. */
    voteBonusExpiresAtMs: number | null;
    /** Product of the active account-level buff multipliers (1 when none). */
    multiplier: number;
}

/**
 * Structured, render-ready profile data for the Activity. All numbers are raw
 * (the client formats them) and timestamps are epoch ms (NOT Discord `<t:>`
 * markup, which wouldn't render in the iframe). The rank title is translated
 * server-side because the rank-title i18n keys aren't shipped in the activity
 * bundle.
 */
export interface ActivityProfileStats {
    level: number;
    exp: number;
    /** Cumulative EXP threshold for the current level (progress-bar floor). */
    expForCurrentLevel: number;
    /** Cumulative EXP threshold for the next level (progress-bar ceiling). */
    expForNextLevel: number;
    /** Translated rank title for the current level. */
    rankName: string;
    /** Translated next rank title, or null when at/over the max rank. */
    nextRankName: string | null;
    /** Levels remaining until the next rank title, or null at max rank. */
    levelsToNextRank: number | null;
    isRankIneligible: boolean;
    overallRank: number;
    totalPlayers: number;
    songsGuessed: number;
    songRank: number;
    gamesPlayed: number;
    gamesRank: number;
    firstPlayMs: number;
    lastActiveMs: number;
    timesVoted: number;
    /** Consecutive days played up to and including the most recent play day. */
    currentPlayStreak: number;
    /** Best consecutive-days-played streak the player has ever reached. */
    longestPlayStreak: number;
    badges: string[];
    buffs: ActivityProfileBuffs;
    /** top.gg vote link for the "vote for bonus EXP" CTA. */
    voteURL: string;
}

export default interface ActivityProfileResponse {
    /** False when the player has no stats yet (never played). */
    found: boolean;
    stats?: ActivityProfileStats;
}
