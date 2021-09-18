import assert from "assert";
import { describe } from "mocha";
import LeaderboardCommand, { LeaderboardType, LeaderboardDuration } from "../../commands/game_commands/leaderboard";
import { getSqlDateString } from "../../helpers/discord_utils";
import dbContext from "../../database_context";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";

describe("getLeaderboardEmbeds", () => {
    describe("all-time leaderboard", () => {
        afterEach(async () => {
            await dbContext.kmq("player_stats").del();
        });

        it("should have one page of entries", async () => {
            const entries = Math.floor((Math.random() * 50) / 10) * 10;
            for (let i = 0; i < entries; i++) {
                await dbContext.kmq("player_stats")
                    .insert({
                        player_id: String(i),
                        songs_guessed: i,
                        exp: i,
                        level: i,
                    });
            }

            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.ALL_TIME)).pageCount);
        });

        it("should have two pages of entries", async () => {
            const entries = Math.floor((Math.random() * 50) / 10) * 10;
            for (let i = 0; i < entries; i++) {
                await dbContext.kmq("player_stats")
                    .insert({
                        player_id: String(i),
                        songs_guessed: i,
                        exp: i,
                        level: i,
                    });
            }

            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.ALL_TIME)).pageCount);
        });
    });

    describe("temporary leaderboard", () => {
        afterEach(async () => {
            await dbContext.kmq("player_game_session_stats").del();
        });

        it("should have one page of entries", async () => {
            const entries = Math.floor((Math.random() * 50) / 10) * 10;
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

            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.DAILY)).pageCount);
            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.WEEKLY)).pageCount);
            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.MONTHLY)).pageCount);
        });

        it("should have two pages of entries", async () => {
            const entries = Math.floor((Math.random() * 50) / 10) * 10;
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

            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.DAILY)).pageCount);
            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.WEEKLY)).pageCount);
            assert.strictEqual(Math.ceil(entries / 10), (await LeaderboardCommand.getLeaderboardEmbeds(new MessageContext("", new KmqMember("", "", "", ""), "", ""), LeaderboardType.GLOBAL, LeaderboardDuration.MONTHLY)).pageCount);
        });
    });
});
