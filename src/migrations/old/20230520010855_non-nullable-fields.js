/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    return knex.schema
        .alterTable("daily_stats", function (table) {
            table.dropNullable("gameSessions");
            table.dropNullable("roundsPlayed");
            table.dropNullable("players");
            table.dropNullable("newPlayers");
            table.dropNullable("serverCount");
        })
        .alterTable("game_messages", function (table) {
            table.dropNullable("weight");
        })
        .alterTable("guilds", function (table) {
            table.dropNullable("join_date");
            table.dropNullable("games_played");
            table.dropNullable("songs_guessed");
        })
        .alterTable("player_game_session_stats", function (table) {
            table.dropNullable("songs_guessed");
            table.dropNullable("exp_gained");
            table.dropNullable("levels_gained");
        })
        .alterTable("player_stats", function (table) {
            table.dropNullable("songs_guessed");
            table.dropNullable("games_played");
            table
                .datetime("first_play")
                .notNullable()
                .defaultTo(knex.fn.now())
                .alter();
            table
                .datetime("last_active")
                .notNullable()
                .defaultTo(knex.fn.now())
                .alter();
            table.dropNullable("exp");
            table.dropNullable("level");
        })
        .alterTable("premium_users", function (table) {
            table.dropNullable("first_subscribed");
        })
        .alterTable("song_metadata", function (table) {
            table.dropNullable("correct_guesses");
            table.dropNullable("rounds_played");
            table.dropNullable("skip_count");
            table.dropNullable("hint_count");
            table.dropNullable("time_to_guess_ms");
            table.dropNullable("time_played_ms");
        })
        .alterTable("top_gg_user_votes", function (table) {
            table.dropNullable("total_votes");
        })
        .alterTable("bookmarked_songs", function (table) {
            table.dropNullable("bookmarked_at");
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
    return knex.schema
        .alterTable("daily_stats", function (table) {
            table.setNullable("gameSessions");
            table.setNullable("roundsPlayed");
            table.setNullable("players");
            table.setNullable("newPlayers");
            table.setNullable("serverCount");
        })
        .alterTable("game_messages", function (table) {
            table.setNullable("weight");
        })
        .alterTable("guilds", function (table) {
            table.setNullable("join_date");
            table.setNullable("games_played");
            table.setNullable("songs_guessed");
        })
        .alterTable("player_game_session_stats", function (table) {
            table.setNullable("songs_guessed");
            table.setNullable("exp_gained");
            table.setNullable("levels_gained");
        })
        .alterTable("player_stats", function (table) {
            table.setNullable("songs_guessed");
            table.setNullable("games_played");
            table.setNullable("exp");
            table.setNullable("level");
        })
        .alterTable("premium_users", function (table) {
            table.setNullable("first_subscribed");
        })
        .alterTable("song_metadata", function (table) {
            table.setNullable("correct_guesses");
            table.setNullable("rounds_played");
            table.setNullable("skip_count");
            table.setNullable("hint_count");
            table.setNullable("time_to_guess_ms");
            table.setNullable("time_played_ms");
        })
        .alterTable("top_gg_user_votes", function (table) {
            table.setNullable("total_votes");
        })
        .alterTable("bookmarked_songs", function (table) {
            table.setNullable("bookmarked_at");
        });
};
