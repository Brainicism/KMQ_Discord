export default interface ActivityRoundGuess {
    userID: string;
    username: string;
    avatarUrl: string | null;
    guess: string;
    isCorrect: boolean;
    ts: number;
}
