import assert from "assert";
import { describe } from "mocha";
import LeaderboardCommand, { LeaderboardType, LeaderboardDuration, ENTRIES_PER_PAGE } from "../../commands/game_commands/leaderboard";
import { getSqlDateString } from "../../helpers/discord_utils";
import dbContext from "../../database_context";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import GameSession from "../../structures/game_session";
import { GameType } from "../../types";
import { state } from "../../kmq";

const SERVER_ID = "0";
const TOTAL_ENTRIES = ENTRIES_PER_PAGE + 1;
const gameStarter = new KmqMember("jisoo", "jisoo#4747", "url", "123");
const messageContext = new MessageContext("", gameStarter, SERVER_ID, "");

const INITIAL_MONTH = 5;
const INITIAL_DAY = 13;
const HOUR = 6;
const MINUTE = 5;
const INITIAL_SECONDS = 3;
const date = new Date(new Date().getFullYear(), INITIAL_MONTH, INITIAL_DAY, HOUR, MINUTE, INITIAL_SECONDS);

describe("getLeaderboardEmbeds", () => {
    describe("all-time leaderboard", () => {
        describe("global leaderboard", () => {
            beforeEach(async () => {
                await dbContext.kmq("player_stats").del();
            });

            it("should match the number of pages and embeds", async () => {
                const rows = [];
                for (let i = 0; i < TOTAL_ENTRIES; i++) {
                    rows.push({
                        player_id: String(i),
                        songs_guessed: i,
                        exp: i + 1,
                        level: i,
                    });
                }

                await dbContext.kmq("player_stats")
                    .insert(rows);

                const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.ALL_TIME);
                let fields = 0;
                for (const embed of embeds) {
                    fields += (await embed()).fields.length;
                }

                assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                assert.strictEqual(fields, TOTAL_ENTRIES);
            });
        });

        describe("server leaderboard", () => {
            beforeEach(async () => {
                await dbContext.kmq("player_stats").del();
                await dbContext.kmq("player_servers").del();
            });

            it("should match the number of pages and embeds", async () => {
                const statsRows = [];
                const serversRows = [];
                for (let i = 0; i < TOTAL_ENTRIES; i++) {
                    statsRows.push({
                        player_id: String(i),
                        songs_guessed: i,
                        exp: i + 1,
                        level: i,
                    });

                    serversRows.push({
                        player_id: String(i),
                        server_id: SERVER_ID,
                    });
                }

                await dbContext.kmq("player_stats")
                    .insert(statsRows);

                await dbContext.kmq("player_servers")
                    .insert(serversRows);

                const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.ALL_TIME);
                let fields = 0;
                for (const embed of embeds) {
                    fields += (await embed()).fields.length;
                }

                assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                assert.strictEqual(fields, TOTAL_ENTRIES);
            });
        });

        describe("game leaderboard", () => {
            beforeEach(async () => {
                await dbContext.kmq("player_stats").del();
            });

            it("should match the number of pages and embeds", async () => {
                const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                state.gameSessions = { [SERVER_ID]: gameSession };
                const rows = [];
                for (let i = 0; i < TOTAL_ENTRIES; i++) {
                    rows.push({ player_id: String(i),
                        songs_guessed: i,
                        exp: i + 1,
                        level: i,
                    });

                    gameSession.participants.add(String(i));
                }

                await dbContext.kmq("player_stats")
                    .insert(rows);

                const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.ALL_TIME);
                let fields = 0;
                for (const embed of embeds) {
                    fields += (await embed()).fields.length;
                }

                assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                assert.strictEqual(fields, TOTAL_ENTRIES);
            });
        });
    });

    describe("temporary leaderboard", () => {
        describe("daily leaderboard", () => {
            describe("global leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.DAILY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- yesterday
                        const yesterday = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last week
                        const lastWeek = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.DAILY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });

            describe("server leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                    await dbContext.kmq("player_servers").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const statsRows = [];
                    const serversRows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        statsRows.push({ player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(statsRows);

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.DAILY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const statsRows = [];
                    const serversRows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- yesterday
                        const yesterday = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last week
                        const lastWeek = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(statsRows);

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.DAILY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });

            describe("game leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        rows.push({ player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        gameSession.participants.add(String(i));
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.DAILY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- yesterday
                        const yesterday = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last week
                        const lastWeek = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        gameSession.participants.add(String(i));
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.DAILY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });
        });

        describe("weekly leaderboard", () => {
            describe("global leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.WEEKLY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- yesterday
                        const yesterday = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last week
                        const lastWeek = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.WEEKLY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });

            describe("server leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                    await dbContext.kmq("player_servers").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const statsRows = [];
                    const serversRows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        statsRows.push({ player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(statsRows);

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.WEEKLY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const statsRows = [];
                    const serversRows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- yesterday
                        const yesterday = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last week
                        const lastWeek = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(statsRows);

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.WEEKLY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });

            describe("game leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        rows.push({ player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        gameSession.participants.add(String(i));
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.WEEKLY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- yesterday
                        const yesterday = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last week
                        const lastWeek = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        gameSession.participants.add(String(i));
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.WEEKLY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });
        });

        describe("monthly leaderboard", () => {
            describe("global leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.MONTHLY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- yesterday
                        const yesterday = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- last week
                        const lastWeek = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.MONTHLY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });

            describe("server leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                    await dbContext.kmq("player_servers").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const statsRows = [];
                    const serversRows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        statsRows.push({ player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(statsRows);

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.MONTHLY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const statsRows = [];
                    const serversRows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- yesterday
                        const yesterday = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- last week
                        const lastWeek = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        statsRows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(statsRows);

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.MONTHLY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });

            describe("game leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_game_session_stats").del();
                });

                it("should match the number of pages and embeds (single per-player entry)", async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        rows.push({ player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        gameSession.participants.add(String(i));
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.MONTHLY);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });

                it("should match the number of pages and embeds (multiple per-player entries)", async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };
                    const rows = [];
                    for (let i = 0; i < TOTAL_ENTRIES; i++) {
                        // valid -- right now
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(date.getTime()),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- a second behind
                        const secondBehind = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(secondBehind.setSeconds(INITIAL_SECONDS - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- yesterday
                        const yesterday = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(yesterday.setDate(INITIAL_DAY - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // valid -- last week
                        const lastWeek = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastWeek.setDate(INITIAL_DAY - 7)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        // invalid -- last month
                        const lastMonth = date;
                        rows.push({
                            player_id: String(i),
                            date: getSqlDateString(lastMonth.setMonth(INITIAL_MONTH - 1)),
                            songs_guessed: i,
                            exp_gained: i + 1,
                            levels_gained: i,
                        });

                        gameSession.participants.add(String(i));
                    }

                    await dbContext.kmq("player_game_session_stats")
                        .insert(rows);

                    const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.MONTHLY, date);
                    let fields = 0;
                    for (const embed of embeds) {
                        fields += (await embed()).fields.length;
                    }

                    assert.strictEqual(pageCount, Math.ceil(TOTAL_ENTRIES / ENTRIES_PER_PAGE));
                    assert.strictEqual(fields, TOTAL_ENTRIES);
                });
            });
        });
    });
});
