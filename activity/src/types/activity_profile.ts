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
    badges: string[];
    buffs: ActivityProfileBuffs;
    voteURL: string;
}

export interface ActivityProfileResponse {
    found: boolean;
    stats?: ActivityProfileStats;
}
