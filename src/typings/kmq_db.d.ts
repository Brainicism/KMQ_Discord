import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export interface AvailableSongs {
    artist_aliases: string;
    artist_name_en: string;
    artist_name_ko: Generated<string | null>;
    clean_song_name_alpha_numeric: string;
    clean_song_name_en: string;
    clean_song_name_ko: string;
    id_artist: number;
    id_parent_artist: number;
    issolo: "n" | "y";
    link: string;
    members: "coed" | "female" | "male";
    original_artist_name_en: string;
    previous_name_en: Generated<string | null>;
    previous_name_ko: Generated<string | null>;
    publishedon: Date;
    rank: number;
    song_aliases: string;
    song_name_en: string;
    song_name_ko: string;
    tags: Generated<string | null>;
    views: number;
    vtype: "audio" | "main";
}

export interface Badges {
    id: number;
    name: string;
    priority: number;
}

export interface BadgesPlayers {
    badge_id: number;
    user_id: string;
}

export interface BannedPlayers {
    created_at: Date;
    id: string;
    reason: string;
}

export interface BannedServers {
    created_at: Date;
    id: string;
    reason: string;
}

export interface BookmarkedSongs {
    bookmarked_at: Date;
    user_id: string;
    vlink: string;
}

export interface CachedSongDuration {
    duration: number;
    vlink: string;
}

export interface CompetitionModerators {
    guild_id: string;
    user_id: string;
}

export interface DailyStats {
    date: Date;
    gameSessions: Generated<number>;
    newPlayers: Generated<number>;
    players: Generated<number>;
    roundsPlayed: Generated<number>;
    serverCount: Generated<number>;
}

export interface DeadLinks {
    reason: Generated<string | null>;
    vlink: string;
}

export interface GameMessages {
    category: string;
    id: Generated<number>;
    message: string;
    title: string;
    weight: Generated<number>;
}

export interface GameOptionPresets {
    guild_id: string;
    option_name: string;
    option_value: Generated<string | null>;
    preset_name: string;
}

export interface GameOptionPresetsJson {
    game_options: string;
    guild_id: string;
    preset_name: string;
}

export interface GameOptions {
    client_id: Generated<string>;
    guild_id: string;
    option_name: string;
    option_value: Generated<string | null>;
}

export interface GameSessions {
    avg_guess_time: number;
    correct_guesses: number;
    guild_id: string;
    id: Generated<number>;
    num_participants: number;
    rounds_played: number;
    session_length: number;
    start_date: Date;
}

export interface Guilds {
    games_played: Generated<number>;
    guild_id: string;
    join_date: Date;
    last_active: Generated<Date | null>;
    songs_guessed: Generated<number>;
}

export interface KnexMigrations {
    batch: Generated<number | null>;
    id: Generated<number>;
    migration_time: Generated<Date>;
    name: Generated<string | null>;
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
    date: Date;
    exp_gained: Generated<number>;
    levels_gained: Generated<number>;
    player_id: string;
    songs_guessed: Generated<number>;
}

export interface PlayerServers {
    player_id: string;
    server_id: string;
}

export interface PlayerStats {
    exp: Generated<number>;
    first_play: Generated<Date>;
    games_played: Generated<number>;
    last_active: Generated<Date>;
    level: Generated<number>;
    player_id: string;
    songs_guessed: Generated<number>;
}

export interface PremiumUsers {
    active: number;
    first_subscribed: Date;
    source: "loyalty" | "patreon";
    user_id: string;
}

export interface SongMetadata {
    correct_guesses: Generated<number>;
    correct_guesses_legacy: number;
    hint_count: Generated<number>;
    rounds_played: Generated<number>;
    rounds_played_legacy: number;
    skip_count: Generated<number>;
    time_played_ms: Generated<number>;
    time_to_guess_ms: Generated<number>;
    vlink: string;
}

export interface SystemStats {
    cluster_id: Generated<number | null>;
    date: Date;
    stat_name: string;
    stat_value: number;
}

export interface TopGgUserVotes {
    buff_expiry_date: Date;
    total_votes: Generated<number>;
    user_id: string;
}

export interface KmqDB {
    "kpop_videos.app_kpop": AppKpop;
    "kpop_videos.app_kpop_agrelation": AppKpopAgrelation;
    "kpop_videos.app_kpop_company": AppKpopCompany;
    "kpop_videos.app_kpop_gaondigi": AppKpopGaondigi;
    "kpop_videos.app_kpop_group": AppKpopGroup;
    "kpop_videos.app_kpop_ms": AppKpopMs;
    "kpop_videos.app_upcoming": AppUpcoming;
    available_songs: AvailableSongs;
    badges: Badges;
    badges_players: BadgesPlayers;
    banned_players: BannedPlayers;
    banned_servers: BannedServers;
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
