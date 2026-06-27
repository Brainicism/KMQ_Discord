// A queued "achievement unlocked" celebration, rendered as a transient toast.
export default interface AchievementToast {
    /** Stable key for React + dismissal (one per achievementUnlocked event). */
    id: string;
    userID: string;
    username: string;
    avatarUrl: string | null;
    achievements: Array<{ name: string }>;
}
