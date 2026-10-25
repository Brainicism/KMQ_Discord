enum ShuffleType {
    RANDOM = "random",
    WEIGHTED_EASY = "weighted_easy",
    WEIGHTED_HARD = "weighted_hard",
    POPULARITY = "popularity",
    CHRONOLOGICAL = "chronological",
    REVERSE_CHRONOLOGICAL = "reversechronological",
    /** Only valid while a playlist is set; see GuildPreference.getEffectiveShuffleType */
    PLAYLIST_ORDER = "playlist_order",
}

export default ShuffleType;
