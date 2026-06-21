import * as gameUtils from "../../../helpers/game_utils";
import * as utils from "../../../helpers/utils";
import { describe } from "mocha";
import ProfileCommand from "../../../commands/game_commands/profile";
import assert from "assert";
import dbContext from "../../../database_context";
import sinon from "sinon";

const GUILD_ID = "guild_id";

describe("ProfileCommand.getProfileStats", () => {
    const sandbox = sinon.createSandbox();

    beforeEach(async () => {
        await dbContext.kmq.deleteFrom("player_stats").execute();
        await dbContext.kmq.deleteFrom("top_gg_user_votes").execute();
        await dbContext.kmq.deleteFrom("badges_players").execute();
        // Deterministic, buff-free baseline (these are time/DB dependent).
        sandbox.stub(gameUtils, "isPowerHour").returns(false);
        sandbox.stub(gameUtils, "isFirstGameOfDay").resolves(false);
        sandbox.stub(utils, "isWeekend").returns(false);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("returns null when the player has no stats", async () => {
        const stats = await ProfileCommand.getProfileStats("nobody", GUILD_ID);
        assert.strictEqual(stats, null);
    });

    it("maps raw player_stats to structured fields with correct relative ranks", async () => {
        await dbContext.kmq
            .insertInto("player_stats")
            .values([
                {
                    player_id: "high",
                    songs_guessed: 100,
                    games_played: 50,
                    exp: 1000,
                    level: 30,
                },
                {
                    player_id: "mid",
                    songs_guessed: 50,
                    games_played: 25,
                    exp: 500,
                    level: 20,
                },
                {
                    player_id: "low",
                    songs_guessed: 10,
                    games_played: 5,
                    exp: 100,
                    level: 10,
                },
            ])
            .execute();

        const stats = await ProfileCommand.getProfileStats("mid", GUILD_ID);
        assert.ok(stats);
        assert.strictEqual(stats.level, 20);
        assert.strictEqual(stats.exp, 500);
        assert.strictEqual(stats.songsGuessed, 50);
        assert.strictEqual(stats.gamesPlayed, 25);
        assert.strictEqual(stats.totalPlayers, 3);
        // exactly one player ranks above "mid" in each category → #2
        assert.strictEqual(stats.overallRank, 2);
        assert.strictEqual(stats.songRank, 2);
        assert.strictEqual(stats.gamesRank, 2);
        assert.strictEqual(stats.isRankIneligible, false);
        // no active buffs in the baseline
        assert.strictEqual(stats.buffs.multiplier, 1);
        assert.strictEqual(stats.buffs.powerHour, false);
        assert.strictEqual(stats.buffs.voteBonusActive, false);
    });

    it("multiplies active account-level buffs into the multiplier", async () => {
        sandbox.restore();
        sandbox.stub(gameUtils, "isPowerHour").returns(true);
        sandbox.stub(gameUtils, "isFirstGameOfDay").resolves(true);
        sandbox.stub(utils, "isWeekend").returns(false);

        await dbContext.kmq
            .insertInto("player_stats")
            .values([
                {
                    player_id: "p",
                    songs_guessed: 1,
                    games_played: 1,
                    exp: 10,
                    level: 1,
                },
            ])
            .execute();

        const stats = await ProfileCommand.getProfileStats("p", GUILD_ID);
        assert.ok(stats);
        assert.strictEqual(stats.buffs.powerHour, true);
        assert.strictEqual(stats.buffs.firstGameOfDay, true);
        // POWER_HOUR (2) * FIRST_GAME_OF_DAY (1.5) = 3
        assert.strictEqual(stats.buffs.multiplier, 3);
    });

    it("flags an active vote bonus from a future buff expiry", async () => {
        // MySQL DATETIME truncates to whole seconds, so use a sub-second-free
        // timestamp to keep the round-tripped expiry exactly comparable.
        const future = new Date(
            Math.floor((Date.now() + 60 * 60 * 1000) / 1000) * 1000,
        );

        await dbContext.kmq
            .insertInto("player_stats")
            .values([
                {
                    player_id: "voter",
                    songs_guessed: 1,
                    games_played: 1,
                    exp: 10,
                    level: 1,
                },
            ])
            .execute();

        await dbContext.kmq
            .insertInto("top_gg_user_votes")
            .values([
                {
                    user_id: "voter",
                    total_votes: 4,
                    buff_expiry_date: future,
                },
            ])
            .execute();

        const stats = await ProfileCommand.getProfileStats("voter", GUILD_ID);
        assert.ok(stats);
        assert.strictEqual(stats.timesVoted, 4);
        assert.strictEqual(stats.buffs.voteBonusActive, true);
        assert.strictEqual(stats.buffs.voteBonusExpiresAtMs, future.getTime());
        // VOTE bonus multiplier (2)
        assert.strictEqual(stats.buffs.multiplier, 2);
    });
});
