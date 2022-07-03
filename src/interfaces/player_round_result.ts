import type KmqMember from "../structures/kmq_member";

export default interface PlayerRoundResult {
    player: KmqMember;
    streak: number;
    expGain: number;
    pointsEarned: number;
}
