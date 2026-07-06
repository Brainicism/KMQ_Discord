// Mirror of one entry of the "levelUp" ActivityEvent payload (server-resolved).
export default interface LevelUp {
    userID: string;
    username: string;
    startLevel: number;
    endLevel: number;
    /** Localized rank title at the new level (e.g. "Nugu"). */
    rank: string;
    /** True when the new level crosses into a new rank tier. */
    isRankUp: boolean;
}
