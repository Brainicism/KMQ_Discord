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
const gameStarter = new KmqMember("jisoo", "jisoo#4747", "url", "123");
const messageContext = new MessageContext("", gameStarter, SERVER_ID, "");

const INITIAL_MONTH = 5;
const INITIAL_DAY = 13;
const HOUR = 6;
const MINUTE = 5;
const INITIAL_SECONDS = 3;
const date = new Date(new Date().getFullYear(), INITIAL_MONTH, INITIAL_DAY, HOUR, MINUTE, INITIAL_SECONDS);
const secondAgo = new Date(date).setSeconds(INITIAL_SECONDS - 1);
const yesterday = new Date(date).setDate(INITIAL_DAY - 1);
const lastWeek = new Date(date).setDate(INITIAL_DAY - 7);
const lastMonth = new Date(date).setMonth(INITIAL_MONTH - 1);

const INITIAL_TOTAL_ENTRIES = ENTRIES_PER_PAGE * 5;

for (const TOTAL_ENTRIES of [INITIAL_TOTAL_ENTRIES - 1, INITIAL_TOTAL_ENTRIES, INITIAL_TOTAL_ENTRIES + 1]) {
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    describe(`getLeaderboardEmbeds (${TOTAL_ENTRIES % ENTRIES_PER_PAGE} mod ENTRIES_PER_PAGE entries)`, () => {
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

                        // invalid -- players outside of server
                        statsRows.push({
                            player_id: String(TOTAL_ENTRIES + i),
                            songs_guessed: i,
                            exp: i + 1,
                            level: i,
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
                        rows.push({
                            player_id: String(i),
                            songs_guessed: i,
                            exp: i + 1,
                            level: i,
                        });

                        gameSession.participants.add(String(i));

                        // invalid -- not in game
                        rows.push({
                            player_id: String(TOTAL_ENTRIES + i),
                            songs_guessed: i,
                            exp: i + 1,
                            level: i,
                        });
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

                            // valid -- a second ago
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- yesterday
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last week
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
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

                            // valid -- a second ago
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- yesterday
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last week
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            serversRows.push({
                                player_id: String(i),
                                server_id: SERVER_ID,
                            });

                            // invalid -- players outside of server
                            statsRows.push({
                                player_id: String(TOTAL_ENTRIES + i),
                                date: getSqlDateString(),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
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

                            // valid -- a second ago
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- yesterday
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last week
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            gameSession.participants.add(String(i));

                            // invalid -- not in game
                            rows.push({
                                player_id: String(TOTAL_ENTRIES + i),
                                date: getSqlDateString(),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });
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

                            // valid -- a second ago
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- yesterday
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last week
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
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

                            // valid -- a second ago
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- yesterday
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last week
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            serversRows.push({
                                player_id: String(i),
                                server_id: SERVER_ID,
                            });

                            // invalid -- players outside of server
                            statsRows.push({
                                player_id: String(TOTAL_ENTRIES + i),
                                date: getSqlDateString(),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
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

                            // valid -- a second ago
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- yesterday
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last week
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            gameSession.participants.add(String(i));

                            // invalid -- not in game
                            rows.push({
                                player_id: String(TOTAL_ENTRIES + i),
                                date: getSqlDateString(),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });
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

                            // valid -- a second ago
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- yesterday
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- last week
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
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

                            // valid -- a second ago
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- yesterday
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- last week
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            statsRows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            serversRows.push({
                                player_id: String(i),
                                server_id: SERVER_ID,
                            });

                            // invalid -- players outside of server
                            statsRows.push({
                                player_id: String(TOTAL_ENTRIES + i),
                                date: getSqlDateString(),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
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

                            // valid -- a second ago
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(secondAgo),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- yesterday
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(yesterday),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // valid -- last week
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastWeek),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            // invalid -- last month
                            rows.push({
                                player_id: String(i),
                                date: getSqlDateString(lastMonth),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });

                            gameSession.participants.add(String(i));

                            // invalid -- not in game
                            rows.push({
                                player_id: String(TOTAL_ENTRIES + i),
                                date: getSqlDateString(),
                                songs_guessed: i,
                                exp_gained: i + 1,
                                levels_gained: i,
                            });
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
}
