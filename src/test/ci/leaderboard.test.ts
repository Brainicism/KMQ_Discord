import assert from "assert";
import { describe } from "mocha";
import _ from "lodash";
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
const INITIAL_DAY = 14;
const HOUR = 6;
const MINUTE = 5;
const INITIAL_SECONDS = 3;
const date = new Date(new Date().getFullYear(), INITIAL_MONTH, INITIAL_DAY, HOUR, MINUTE, INITIAL_SECONDS);
const secondAgo = new Date(date).setSeconds(INITIAL_SECONDS - 1);
const yesterday = new Date(date).setDate(INITIAL_DAY - 1);
const lastWeek = new Date(date).setDate(INITIAL_DAY - 7);
const lastMonth = new Date(date).setMonth(INITIAL_MONTH - 1);

const INITIAL_TOTAL_ENTRIES = ENTRIES_PER_PAGE * 5;

for (const TOTAL_ENTRIES of _.range(INITIAL_TOTAL_ENTRIES, INITIAL_TOTAL_ENTRIES + ENTRIES_PER_PAGE)) {
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
            beforeEach(async () => {
                await dbContext.kmq("player_game_session_stats").del();

                const rows = [];
                rows.push({
                    player_id: "0",
                    date: getSqlDateString(date.getTime()),
                    songs_guessed: 1,
                    exp_gained: 1,
                    levels_gained: 1,
                });

                rows.push({
                    player_id: "0",
                    date: getSqlDateString(secondAgo),
                    songs_guessed: 1,
                    exp_gained: 1,
                    levels_gained: 1,
                });

                rows.push({
                    player_id: "1",
                    date: getSqlDateString(secondAgo),
                    songs_guessed: 1,
                    exp_gained: 1,
                    levels_gained: 1,
                });

                rows.push({
                    player_id: "2",
                    date: getSqlDateString(yesterday),
                    songs_guessed: 1,
                    exp_gained: 1,
                    levels_gained: 1,
                });

                rows.push({
                    player_id: "3",
                    date: getSqlDateString(lastWeek),
                    songs_guessed: 1,
                    exp_gained: 1,
                    levels_gained: 1,
                });

                rows.push({
                    player_id: "4",
                    date: getSqlDateString(lastMonth),
                    songs_guessed: 1,
                    exp_gained: 1,
                    levels_gained: 1,
                });

                for (let i = 5; i < TOTAL_ENTRIES; i++) {
                    rows.push({
                        player_id: String(i),
                        date: getSqlDateString(date.getTime()),
                        songs_guessed: 1,
                        exp_gained: 1,
                        levels_gained: 1,
                    });
                }

                await dbContext.kmq("player_game_session_stats")
                    .insert(rows);
            });

            describe("global leaderboard", () => {
                describe("daily leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry yesterday
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 3;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.DAILY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("weekly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 2;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.WEEKLY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("monthly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring last month
                        const validEntryCount = TOTAL_ENTRIES - 1;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GLOBAL, LeaderboardDuration.MONTHLY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });
            });

            describe("server leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq("player_servers").del();

                    const serversRows = [];
                    // Player with id 0 is outside server
                    for (let i = 1; i <= TOTAL_ENTRIES; i++) {
                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq("player_servers")
                        .insert(serversRows);
                });

                describe("daily leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside server
                        // Ignoring entry yesterday
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 4;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.DAILY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("weekly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside server
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 3;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.WEEKLY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("monthly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside server
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 2;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.SERVER, LeaderboardDuration.MONTHLY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });
            });

            describe("game leaderboard", () => {
                beforeEach(async () => {
                    const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                    state.gameSessions = { [SERVER_ID]: gameSession };

                    // Player with id 0 is not in game
                    for (let i = 1; i < TOTAL_ENTRIES; i++) {
                        gameSession.participants.add(String(i));
                    }
                });

                describe("daily leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside game
                        // Ignoring entry yesterday
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 4;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.DAILY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("weekly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside game
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 3;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.WEEKLY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("monthly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside game
                        // Ignoring entry last month
                        const validEntryCount = TOTAL_ENTRIES - 2;
                        const { embeds, pageCount } = await LeaderboardCommand.getLeaderboardEmbeds(messageContext, LeaderboardType.GAME, LeaderboardDuration.MONTHLY, date);
                        let fields = 0;
                        for (const embed of embeds) {
                            fields += (await embed()).fields.length;
                        }

                        assert.strictEqual(pageCount, Math.ceil(validEntryCount / ENTRIES_PER_PAGE));
                        assert.strictEqual(fields, validEntryCount);
                    });
                });
            });
        });
    });
}
