import * as discordUtils from "../../helpers/discord_utils";
import GameSession from "../../structures/game_session";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import MessageContext from "../../structures/message_context";
import PlayCommand from "../../commands/game_commands/play";
import Player from "../../structures/player";
import assert from "assert";
import sinon from "sinon";
import type TeamScoreboard from "../../structures/team_scoreboard";

function getMockGuildPreference(): GuildPreference {
    const guildPreference = new GuildPreference("test");
    sinon.stub(guildPreference, "updateGuildPreferences");
    return guildPreference;
}

const mockMessageContext = new MessageContext("dummy", new KmqMember("dummy"));

describe("begin command", () => {
    const sandbox = sinon.createSandbox();
    const gameStarter = new KmqMember("123");

    describe("can start", () => {
        describe("game session is null", () => {
            it("should return false", () => {
                assert.strictEqual(
                    PlayCommand.canStartTeamsGame(
                        null,
                        new MessageContext("", gameStarter)
                    ),
                    false
                );
            });
        });

        describe("classic game session", () => {
            sandbox
                .stub(discordUtils, "getCurrentVoiceMembers")
                .callsFake((_voiceChannelID) => []);

            const gameSession = new GameSession(
                getMockGuildPreference(),
                "dummy",
                "dummy",
                "dummy",
                gameStarter,
                GameType.CLASSIC,
                false
            );

            sandbox.restore();

            it("should return false (classic games are not started using ,begin)", () => {
                assert.strictEqual(
                    PlayCommand.canStartTeamsGame(
                        gameSession,
                        new MessageContext("", gameStarter)
                    ),
                    false
                );

                assert.strictEqual(
                    PlayCommand.canStartTeamsGame(
                        gameSession,
                        new MessageContext("", gameStarter)
                    ),
                    false
                );
            });
        });

        describe("teams game session", () => {
            sandbox
                .stub(discordUtils, "getCurrentVoiceMembers")
                .callsFake((_voiceChannelID) => []);
            const gameSession = new GameSession(
                getMockGuildPreference(),
                "dummy",
                "dummy",
                "dummy",
                gameStarter,
                GameType.TEAMS,
                true
            );

            sandbox.restore();

            describe("no teams have been added yet", () => {
                it("should return false", () => {
                    assert.strictEqual(
                        PlayCommand.canStartTeamsGame(
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
                        new Player("dummy", "dummy", "dummy", 0, "dummy")
                    );

                    assert.strictEqual(
                        PlayCommand.canStartTeamsGame(
                            gameSession,
                            mockMessageContext
                        ),
                        true
                    );

                    scoreboard.addTeam(
                        "Loona2",
                        new Player("dummy", "dummy", "dummy", 0, "dummy")
                    );

                    assert.strictEqual(
                        PlayCommand.canStartTeamsGame(
                            gameSession,
                            mockMessageContext
                        ),
                        true
                    );
                });
            });
        });
    });
});
