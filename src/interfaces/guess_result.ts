import KmqMember from "../structures/kmq_member";

export default interface GuessResult {
    correct: boolean;
    error?: boolean;
    correctGuessers?: Array<KmqMember>;
}
