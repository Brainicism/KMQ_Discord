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

describe("getLeaderboardEmbeds", () => {
    describe("all-time leaderboard", () => {
        describe("global leaderboard", () => {
            afterEach(async () => {
                await dbContext.kmq("player_stats").del();
            });

            it("should match the number of pages", async () => {
                const entries = Math.floor((Math.random() * 50) / ENTRIES_PER_PAGE) * ENTRIES_PER_PAGE;
                for (let i = 0; i < entries; i++) {
                    await dbContext.kmq("player_stats")
                        .insert({
                            player_id: String(i),
                            songs_guessed: i,
                            exp: i,
                            level: i,
                        });
                }

                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.ALL_TIME)).pageCount);
            });
        });

        describe("server leaderboard", () => {
            afterEach(async () => {
                await dbContext.kmq("player_stats").del();
                await dbContext.kmq("player_servers").del();
            });

            it("should match the number of pages", async () => {
                const entries = Math.floor((Math.random() * 50) / ENTRIES_PER_PAGE) * ENTRIES_PER_PAGE;
                for (let i = 0; i < entries; i++) {
                    await dbContext.kmq("player_stats")
                        .insert({
                            player_id: String(i),
                            songs_guessed: i,
                            exp: i,
                            level: i,
                        });

                    await dbContext.kmq("player_servers")
                        .insert({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                }

                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.SERVER, LeaderboardDuration.ALL_TIME)).pageCount);
            });
        });

        describe("game leaderboard", () => {
            afterEach(async () => {
                await dbContext.kmq("player_stats").del();
                await dbContext.kmq("player_servers").del();
            });

            it("should match the number of pages", async () => {
                const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                state.gameSessions = { [SERVER_ID]: gameSession };
                const entries = Math.floor((Math.random() * 50) / ENTRIES_PER_PAGE) * ENTRIES_PER_PAGE;
                for (let i = 0; i < entries; i++) {
                    await dbContext.kmq("player_stats")
                        .insert({
                            player_id: String(i),
                            songs_guessed: i,
                            exp: i,
                            level: i,
                        });

                    await dbContext.kmq("player_servers")
                        .insert({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });

                    gameSession.participants.add(String(i));
                }

                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.GAME, LeaderboardDuration.ALL_TIME)).pageCount);
            });
        });
    });

    describe("temporary leaderboard", () => {
        describe("global leaderboard", () => {
            afterEach(async () => {
                await dbContext.kmq("player_game_session_stats").del();
            });

            it("should match the number of pages", async () => {
                const entries = Math.floor((Math.random() * 50) / ENTRIES_PER_PAGE) * ENTRIES_PER_PAGE;
                for (let i = 0; i < entries; i++) {
                    await dbContext.kmq("player_game_session_stats")
                        .insert({
                            player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i,
                            levels_gained: i,
                        });
                }

                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.DAILY)).pageCount);
                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.WEEKLY)).pageCount);
                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.MONTHLY)).pageCount);
            });
        });

        describe("server leaderboard", () => {
            afterEach(async () => {
                await dbContext.kmq("player_game_session_stats").del();
                await dbContext.kmq("player_servers").del();
            });

            it("should match the number of pages", async () => {
                const entries = Math.floor((Math.random() * 50) / ENTRIES_PER_PAGE) * ENTRIES_PER_PAGE;
                for (let i = 0; i < entries; i++) {
                    await dbContext.kmq("player_game_session_stats")
                        .insert({
                            player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i,
                            levels_gained: i,
                        });

                    await dbContext.kmq("player_servers")
                        .insert({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                }

                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.SERVER, LeaderboardDuration.DAILY)).pageCount);
                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.SERVER, LeaderboardDuration.WEEKLY)).pageCount);
                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.SERVER, LeaderboardDuration.MONTHLY)).pageCount);
            });
        });

        describe("game leaderboard", () => {
            afterEach(async () => {
                await dbContext.kmq("player_game_session_stats").del();
            });

            it("should match the number of pages", async () => {
                const gameSession = new GameSession("", "", SERVER_ID, gameStarter, GameType.CLASSIC);
                state.gameSessions = { [SERVER_ID]: gameSession };
                const entries = Math.floor((Math.random() * 50) / ENTRIES_PER_PAGE) * ENTRIES_PER_PAGE;
                for (let i = 0; i < entries; i++) {
                    await dbContext.kmq("player_game_session_stats")
                        .insert({
                            player_id: String(i),
                            date: getSqlDateString(),
                            songs_guessed: i,
                            exp_gained: i,
                            levels_gained: i,
                        });

                    await dbContext.kmq("player_servers")
                        .insert({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });

                    gameSession.participants.add(String(i));
                }

                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.GAME, LeaderboardDuration.DAILY)).pageCount);
                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.GAME, LeaderboardDuration.WEEKLY)).pageCount);
                assert.strictEqual(Math.ceil(entries / ENTRIES_PER_PAGE), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", gameStarter, SERVER_ID, ""), LeaderboardType.GAME, LeaderboardDuration.MONTHLY)).pageCount);
            });
        });
    });
});
