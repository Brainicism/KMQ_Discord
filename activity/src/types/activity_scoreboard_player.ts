export default interface ActivityScoreboardPlayer {
    id: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    expGain: number;
    inVC: boolean;
}
