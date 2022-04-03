import assert from "assert";
import sinon from "sinon";

import BeginCommand from "../../commands/game_commands/begin";
import * as discordUtils from "../../helpers/discord_utils";
import GameSession from "../../structures/game_session";
import KmqMember from "../../structures/kmq_member";
import MessageContext from "../../structures/message_context";
import Player from "../../structures/player";
import TeamScoreboard from "../../structures/team_scoreboard";
import { GameType } from "../../types";

const sandbox = sinon.createSandbox();
const gameStarter = new KmqMember("jisoo", "jisoo#4747", "url", "123");

describe("begin command", () => {
    describe("can start", () => {
        describe("game session is null", () => {
            it("should return false", () => {
                assert.strictEqual(BeginCommand.canStart(null, null), false);
            });
        });

        describe("classic game session", () => {
            sandbox
                .stub(discordUtils, "getCurrentVoiceMembers")
                .callsFake((_voiceChannelID) => []);
            const gameSession = new GameSession(
                null,
                null,
                null,
                gameStarter,
                GameType.CLASSIC
            );

            sandbox.restore();

            it("should return false (classic games are not started using ,begin)", () => {
                assert.strictEqual(
                    BeginCommand.canStart(gameSession, null),
                    false
                );

                assert.strictEqual(
                    BeginCommand.canStart(gameSession, null),
                    false
                );
            });
        });

        describe("teams game session", () => {
            sandbox
                .stub(discordUtils, "getCurrentVoiceMembers")
                .callsFake((_voiceChannelID) => []);
            const gameSession = new GameSession(
                null,
                null,
                null,
                gameStarter,
                GameType.TEAMS
            );

            sandbox.restore();

            describe("no teams have been added yet", () => {
                it("should return false", () => {
                    assert.strictEqual(
                        BeginCommand.canStart(
                            gameSession,
                            new MessageContext("", gameStarter)
                        ),
                        false
                    );
                });
            });

            describe("atleast 1 team has been added", () => {
                it("should return false", () => {
                    const scoreboard = gameSession.scoreboard as TeamScoreboard;
                    scoreboard.addTeam(
                        "Loona",
                        new Player(null, null, null, 0)
                    );

                    assert.strictEqual(
                        BeginCommand.canStart(gameSession, null),
                        true
                    );

                    scoreboard.addTeam(
                        "Loona2",
                        new Player(null, null, null, 0)
                    );

                    assert.strictEqual(
                        BeginCommand.canStart(gameSession, null),
                        true
                    );
                });
            });
        });
    });
});
