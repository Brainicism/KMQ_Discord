// Mirror of src/interfaces/activity_profile_response.ts. The Activity bundle
// ships independently of the bot's TS, so the shape is duplicated here rather
// than imported across the tree.

export interface ActivityProfileBuffs {
    powerHour: boolean;
    firstGameOfDay: boolean;
    voteBonusActive: boolean;
    voteBonusExpiresAtMs: number | null;
    multiplier: number;
}

export interface ActivityProfileBadgeHint {
    key: "firstGame" | "win" | "gamesPlayed" | "songsGuessed" | "playStreak";
    count?: number;
}

export interface ActivityProfileBadge {
    name: string;
    earned: boolean;
    /** How to earn it; null for manually-awarded badges. */
    hint: ActivityProfileBadgeHint | null;
    /** Progress toward a locked threshold achievement; null otherwise. */
    progress: { current: number; target: number } | null;
}

export interface ActivityProfileStats {
    level: number;
    exp: number;
    expForCurrentLevel: number;
    expForNextLevel: number;
    rankName: string;
    nextRankName: string | null;
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
    currentPlayStreak: number;
    longestPlayStreak: number;
    badges: ActivityProfileBadge[];
    buffs: ActivityProfileBuffs;
    voteURL: string;
}

export interface ActivityProfileResponse {
    found: boolean;
    stats?: ActivityProfileStats;
}
