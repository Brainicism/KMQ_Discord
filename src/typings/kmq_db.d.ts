import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export interface AvailableSongs {
    song_name_en: string;
    clean_song_name_en: string;
    clean_song_name_alpha_numeric: string;
    song_name_ko: string;
    clean_song_name_ko: string;
    song_aliases: string;
    link: string;
    artist_name_en: string;
    original_artist_name_en: string;
    artist_name_ko: Generated<string | null>;
    artist_aliases: string;
    previous_name_en: Generated<string | null>;
    previous_name_ko: Generated<string | null>;
    members: "coed" | "female" | "male";
    views: number;
    publishedon: Date;
    id_artist: number;
    issolo: "n" | "y";
    id_parent_artist: number;
    vtype: "audio" | "main";
    tags: Generated<string | null>;
    rank: number;
}

export interface Badges {
    id: number;
    name: string;
    priority: number;
}

export interface BadgesPlayers {
    user_id: string;
    badge_id: number;
}

export interface BookmarkedSongs {
    user_id: string;
    vlink: string;
    bookmarked_at: Date;
}

export interface CachedSongDuration {
    vlink: string;
    duration: number;
}

export interface CompetitionModerators {
    guild_id: string;
    user_id: string;
}

export interface DailyStats {
    date: Date;
    gameSessions: Generated<number>;
    roundsPlayed: Generated<number>;
    players: Generated<number>;
    newPlayers: Generated<number>;
    serverCount: Generated<number>;
}

export interface DeadLinks {
    vlink: string;
    reason: Generated<string | null>;
}

export interface GameMessages {
    category: string;
    title: string;
    message: string;
    weight: Generated<number>;
    id: Generated<number>;
}

export interface GameOptionPresets {
    guild_id: string;
    preset_name: string;
    option_name: string;
    option_value: Generated<string | null>;
}

export interface GameOptionPresetsJson {
    guild_id: string;
    preset_name: string;
    game_options: string;
}

export interface GameOptions {
    guild_id: string;
    option_name: string;
    option_value: Generated<string | null>;
    client_id: string;
}

export interface GameSessions {
    id: Generated<number>;
    start_date: Date;
    guild_id: string;
    num_participants: number;
    avg_guess_time: number;
    session_length: number;
    rounds_played: number;
    correct_guesses: number;
}

export interface Guilds {
    guild_id: string;
    join_date: Date;
    last_active: Generated<Date | null>;
    games_played: Generated<number>;
    songs_guessed: Generated<number>;
}

export interface KnexMigrations {
    id: Generated<number>;
    name: Generated<string | null>;
    batch: Generated<number | null>;
    migration_time: Generated<Date>;
}

export interface KnexMigrationsLock {
    index: Generated<number>;
    is_locked: Generated<number | null>;
}

export interface KpopVideosSqlOverrides {
    id: Generated<number>;
    query: string;
    reason: string;
}

export interface LeaderboardEnrollment {
    display_name: string;
    player_id: string;
}

export interface Locale {
    guild_id: string;
    locale: string;
}

export interface NotDownloaded {
    vlink: string;
}

export interface PlayerGameSessionStats {
    player_id: string;
    date: Date;
    songs_guessed: Generated<number>;
    exp_gained: Generated<number>;
    levels_gained: Generated<number>;
}

export interface PlayerServers {
    player_id: string;
    server_id: string;
}

export interface PlayerStats {
    player_id: string;
    songs_guessed: Generated<number>;
    games_played: Generated<number>;
    first_play: Generated<Date>;
    last_active: Generated<Date>;
    exp: Generated<number>;
    level: Generated<number>;
}

export interface PremiumUsers {
    user_id: string;
    active: number;
    first_subscribed: Date;
    source: "loyalty" | "patreon";
}

export interface SongMetadata {
    vlink: string;
    correct_guesses_legacy: number;
    rounds_played_legacy: number;
    correct_guesses: Generated<number>;
    rounds_played: Generated<number>;
    skip_count: Generated<number>;
    hint_count: Generated<number>;
    time_to_guess_ms: Generated<number>;
    time_played_ms: Generated<number>;
}

export interface SystemStats {
    cluster_id: Generated<number | null>;
    stat_name: string;
    stat_value: number;
    date: Date;
}

export interface TopGgUserVotes {
    user_id: string;
    buff_expiry_date: Date;
    total_votes: Generated<number>;
}

export interface KmqDB {
    available_songs: AvailableSongs;
    badges: Badges;
    badges_players: BadgesPlayers;
    bookmarked_songs: BookmarkedSongs;
    cached_song_duration: CachedSongDuration;
    competition_moderators: CompetitionModerators;
    daily_stats: DailyStats;
    dead_links: DeadLinks;
    game_messages: GameMessages;
    game_option_presets: GameOptionPresets;
    game_option_presets_json: GameOptionPresetsJson;
    game_options: GameOptions;
    game_sessions: GameSessions;
    guilds: Guilds;
    knex_migrations: KnexMigrations;
    knex_migrations_lock: KnexMigrationsLock;
    kpop_videos_sql_overrides: KpopVideosSqlOverrides;
    leaderboard_enrollment: LeaderboardEnrollment;
    locale: Locale;
    not_downloaded: NotDownloaded;
    player_game_session_stats: PlayerGameSessionStats;
    player_servers: PlayerServers;
    player_stats: PlayerStats;
    premium_users: PremiumUsers;
    song_metadata: SongMetadata;
    system_stats: SystemStats;
    top_gg_user_votes: TopGgUserVotes;
}
