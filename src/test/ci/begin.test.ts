import assert from "assert";
import BeginCommand from "../../commands/game_commands/begin";
import { GameType } from "../../types";
import GameSession from "../../structures/game_session";
import KmqMember from "../../structures/kmq_member";
import Player from "../../structures/player";
import TeamScoreboard from "../../structures/team_scoreboard";

const gameStarter = new KmqMember("jisoo", "jisoo#4747", "url", "123");
describe("begin command", () => {
    describe("can start", () => {
        describe("game session is null", () => {
            it("should return false", () => {
                assert.strictEqual(BeginCommand.canStart(null, "123", null), false);
            });
        });

        describe("classic game session", () => {
            const gameSession = new GameSession(null, null, null, gameStarter, GameType.CLASSIC);
            it("should return false (classic games are not started using ,begin)", () => {
                assert.strictEqual(BeginCommand.canStart(gameSession, "123", null), false);
                assert.strictEqual(BeginCommand.canStart(gameSession, "567", null), false);
            });
        });

        describe("elimination game session", () => {
            const gameSession = new GameSession(null, null, null, gameStarter, GameType.ELIMINATION);
            describe("invoker is the game session's author", () => {
                it("should return true", () => {
                    assert.strictEqual(BeginCommand.canStart(gameSession, "123", null), true);
                });
            });

            describe("invoker is not the game session's author", () => {
                it("should return false", () => {
                    assert.strictEqual(BeginCommand.canStart(gameSession, "567", null), false);
                });
            });
        });

        describe("teams game session", () => {
            const gameSession = new GameSession(null, null, null, gameStarter, GameType.TEAMS);
            describe("no teams have been added yet", () => {
                it("should return false", () => {
                    assert.strictEqual(BeginCommand.canStart(gameSession, "1231", null), false);
                });
            });

            describe("atleast 1 team has been added", () => {
                it("should return false", () => {
                    const scoreboard = gameSession.scoreboard as TeamScoreboard;
                    scoreboard.addTeam("Loona", new Player(null, null, null, 0));
                    assert.strictEqual(BeginCommand.canStart(gameSession, "1231", null), true);
                    scoreboard.addTeam("Loona2", new Player(null, null, null, 0));
                    assert.strictEqual(BeginCommand.canStart(gameSession, "1231", null), true);
                });
            });
        });
    });
});
