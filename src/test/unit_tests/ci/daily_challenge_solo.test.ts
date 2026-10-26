/* eslint-disable @typescript-eslint/dot-notation */
import * as discordUtils from "../../../helpers/discord_utils";
import { WEB_GUEST_ID_FLAG } from "../../../constants";
import {
    checkDailyEligibility,
    getDailyLeaderboard,
    getDailyResultForPlayer,
} from "../../../helpers/daily_challenge_manager";
import GameSession from "../../../structures/game_session";
import GameType from "../../../enums/game_type";
import GuildPreference from "../../../structures/guild_preference";
import KmqMember from "../../../structures/kmq_member";
import MessageContext from "../../../structures/message_context";
import Player from "../../../structures/player";
import assert from "assert";
import dbContext from "../../../database_context";
import sinon from "sinon";

const RUNNER = "200000000000000001";
const SPECTATOR = "200000000000000002";
const GUEST = (WEB_GUEST_ID_FLAG | 5n).toString();
const DATE = "2030-01-01";

describe("daily challenge solo runs", () => {
    describe("checkDailyEligibility", () => {
        it("allows a logged-in player alone in their channel or room", () => {
            assert.strictEqual(checkDailyEligibility(RUNNER, [RUNNER]), "ok");
            assert.strictEqual(checkDailyEligibility(RUNNER, []), "ok");
        });

        it("rejects runs with anyone else present", () => {
            assert.strictEqual(
                checkDailyEligibility(RUNNER, [RUNNER, SPECTATOR]),
                "not_solo",
            );
        });

        it("rejects website guests", () => {
            assert.strictEqual(
                checkDailyEligibility(GUEST, [GUEST]),
                "requires_login",
            );
        });
    });

    describe("a daily session", () => {
        const sandbox = sinon.createSandbox();
        let session: GameSession;

        beforeEach(async () => {
            await dbContext.kmq
                .deleteFrom("daily_challenge_results")
                .where("player_id", "in", [RUNNER, SPECTATOR, GUEST])
                .execute();

            const guildPreference = new GuildPreference("daily-guild");
            sandbox.stub(guildPreference, "updateGuildPreferences");
            sandbox.stub(discordUtils, "getCurrentVoiceMembers").returns([]);
            session = new GameSession(
                guildPreference,
                "text",
                "voice",
                "daily-guild",
                new KmqMember(RUNNER),
                GameType.CLASSIC,
            );

            session.dailyChallenge = true;
            session.dailyChallengeDate = DATE;
            session.dailyPlayerID = RUNNER;
            for (const id of [RUNNER, SPECTATOR, GUEST]) {
                session.scoreboard.addPlayer(
                    new Player(id, "daily-guild", null, 0, id),
                );
            }
        });

        afterEach(() => {
            sandbox.restore();
        });

        it("only counts the runner's guesses", () => {
            sandbox
                .stub(session as any, "guesserInSessionChannels")
                .returns(true);

            const eligible = (userID: string): boolean =>
                session["guessEligible"](
                    new MessageContext("text", new KmqMember(userID), "g"),
                    Date.now(),
                );

            assert.strictEqual(eligible(RUNNER), true);
            assert.strictEqual(eligible(SPECTATOR), false);
            assert.strictEqual(eligible(GUEST), false);
        });

        it("ranks only the runner, blocks spectators, and skips guests", async () => {
            session["dailyPlayerStats"].set(RUNNER, {
                correct: 5,
                currentStreak: 2,
                bestStreak: 4,
            });

            await session["persistDailyChallengeResults"]();

            const runner = await getDailyResultForPlayer(RUNNER, DATE);
            const spectator = await getDailyResultForPlayer(SPECTATOR, DATE);
            const guest = await getDailyResultForPlayer(GUEST, DATE);

            assert.ok(runner);
            assert.strictEqual(runner.spectated, false);
            assert.strictEqual(runner.correctCount, 5);
            assert.ok(spectator);
            assert.strictEqual(spectator.spectated, true);
            assert.strictEqual(spectator.correctCount, 0);
            assert.strictEqual(guest, null);

            const leaderboard = (await getDailyLeaderboard(DATE)).map(
                (x) => x.playerID,
            );

            assert.ok(leaderboard.includes(RUNNER));
            assert.ok(!leaderboard.includes(SPECTATOR));
        });
    });
});
