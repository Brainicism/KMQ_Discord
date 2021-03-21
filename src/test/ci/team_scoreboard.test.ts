import assert from "assert";
import GuildPreference from "../../structures/guild_preference";
import Team from "../../structures/team";
import TeamScoreboard from "../../structures/team_scoreboard";
import Player from "../../structures/player";

const FIRST_TEAM_NAME = "kmq team";
const SECOND_TEAM_NAME = "not kmqer";

const USER_IDS = ["12345", "23456", "252525", "1000000"];

const USER_TAG = null;
const AVATAR_URL = null;

let scoreboard: TeamScoreboard;
let firstTeam: Team;

beforeEach(() => {
    scoreboard = new TeamScoreboard();
    firstTeam = scoreboard.addTeam(FIRST_TEAM_NAME, new Player("user#0101", USER_IDS[0], AVATAR_URL, 0));
});

describe("add a team", () => {
    it("should add the team to the scoreboard", () => {
        const player = new Player("second_user#1010", USER_IDS[1], AVATAR_URL, 0);

        assert.strictEqual(scoreboard.hasTeam(SECOND_TEAM_NAME), false);
        const secondTeam = scoreboard.addTeam(SECOND_TEAM_NAME, player);
        assert.deepStrictEqual(scoreboard.getTeam(secondTeam.getName()), secondTeam);
        assert.strictEqual(scoreboard.hasTeam(secondTeam.getName()), true);
        assert.deepStrictEqual(Object.values(scoreboard.getTeams()), [firstTeam, secondTeam]);
    });
});

describe("get team of player", () => {
    it("should get the team that corresponds to the player", () => {
        assert.deepStrictEqual(scoreboard.getTeamOfPlayer(USER_IDS[0]), firstTeam);
        assert.strictEqual(scoreboard.getTeamOfPlayer(USER_IDS[1]), null);

        const player = new Player("second_user#1010", USER_IDS[1], AVATAR_URL, 0);
        const secondTeam = scoreboard.addTeam(SECOND_TEAM_NAME, player);
        assert.deepStrictEqual(scoreboard.getTeamOfPlayer(player.getID()), secondTeam);
    });
});

describe("team deletion", () => {
    it("should delete a team when it has no players in it", () => {
        const player = new Player("second_user#1010", USER_IDS[1], AVATAR_URL, 0);
        const secondTeam = scoreboard.addTeam(SECOND_TEAM_NAME, player);
        const anotherPlayer = new Player(USER_TAG, USER_IDS[2], AVATAR_URL, 0);
        scoreboard.addPlayer(SECOND_TEAM_NAME, anotherPlayer);
        const bestPlayer = new Player(USER_TAG, USER_IDS[3], AVATAR_URL, 0);
        scoreboard.addPlayer(FIRST_TEAM_NAME, bestPlayer);
        scoreboard.removePlayer(bestPlayer.getID());
        scoreboard.removePlayer(player.getID());
        scoreboard.removePlayer(USER_IDS[0]);
        assert.deepStrictEqual(Object.values(scoreboard.getTeams()), [secondTeam]);
    });
});

describe("score/xp updating", () => {
    describe("single player, single team scoreboard", () => {
        describe("user guesses correctly multiple times", () => {
            it("should increment the user's score/xp, team score should be player's score, no bonus xp since 1 team", () => {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 1, 50);
                    assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[0]), i + 1);
                    assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[0]), 50 * (i + 1));
                    assert.strictEqual(firstTeam.getScore(), i + 1);
                }
            });
        });

        describe("user has not guessed yet", () => {
            it("should not increment the user's score/xp", () => {
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[0]), 0);
                assert.strictEqual(firstTeam.getScore(), 0);
            });
        });
    });

    describe("multi player, single team scoreboard", () => {
        beforeEach(() => {
            scoreboard.addPlayer(FIRST_TEAM_NAME, new Player("second_user#1010", USER_IDS[1], AVATAR_URL, 0));
        });

        describe("both users guess correctly multiple times", () => {
            it("should increment each user's score, team score should be sum of its players' scores", () => {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 1, 50);
                    if (i % 2 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 1, 50);
                    }
                }
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[0]), 20);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[0]), 1000);
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[1]), 10);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[1]), 500);
                assert.strictEqual(firstTeam.getScore(), 30);
            });
        });

        describe("both users have not guessed yet", () => {
            it("should not increment each user's score", () => {
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[1]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[1]), 0);
                assert.strictEqual(firstTeam.getScore(), 0);
            });
        });
    });

    describe("multi player, multi team scoreboard", () => {
        let secondTeam: Team;
        beforeEach(() => {
            scoreboard.addPlayer(FIRST_TEAM_NAME, new Player("second_user#1010", USER_IDS[1], AVATAR_URL, 0));
            secondTeam = scoreboard.addTeam(SECOND_TEAM_NAME, new Player("jennie#2325", USER_IDS[2], AVATAR_URL, 0));
            scoreboard.addPlayer(SECOND_TEAM_NAME, new Player("g-dragon#9999", USER_IDS[3], AVATAR_URL, 0));
        });

        describe("some users guess correctly multiple times", () => {
            it("should increment each user's score", () => {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 1, 50);
                    if (i === 0) {
                        scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 1, 50);
                    }
                    if (i % 10 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, USER_IDS[2], AVATAR_URL, 1, 50);
                    }
                }
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[0]), 20);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[0]), 1000 * 1.1);

                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[1]), 1);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[1]), 50 * 1.1);

                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[2]), 2);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[2]), 100);

                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[3]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[3]), 0);

                assert.strictEqual(firstTeam.getScore(), 21);
                assert.strictEqual(secondTeam.getScore(), 2);
            });
        });

        describe("all users have not guessed yet", () => {
            it("should not increment each user's score", () => {
                assert.strictEqual(scoreboard.getPlayerScore(USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(USER_IDS[0]), 0);

                assert.strictEqual(firstTeam.getScore(), 0);
                assert.strictEqual(secondTeam.getScore(), 0);
            });
        });
    });
});

describe("winner detection", () => {
    let secondTeam: Team;
    beforeEach(() => {
        scoreboard.addPlayer(FIRST_TEAM_NAME, new Player("sakura#5478", USER_IDS[1], AVATAR_URL, 0));
        secondTeam = scoreboard.addTeam(SECOND_TEAM_NAME, new Player("jennie#2325", USER_IDS[2], AVATAR_URL, 0));
        scoreboard.addPlayer(SECOND_TEAM_NAME, new Player("g-dragon#9999", USER_IDS[3], AVATAR_URL, 0));
    });

    describe("nobody has a score yet", () => {
        it("should return an empty array", () => {
            assert.deepStrictEqual(scoreboard.getWinners(), []);
        });
    });

    describe("single player, single team, has score", () => {
        it("should return the team", () => {
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 10, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].name, FIRST_TEAM_NAME);
            assert.strictEqual(scoreboard.isTeamFirstPlace(FIRST_TEAM_NAME), true);
        });
    });

    describe("multiple players, single team, has different scores", () => {
        it("should return the team", () => {
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 10, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 15, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].name, FIRST_TEAM_NAME);
            assert.strictEqual(scoreboard.isTeamFirstPlace(FIRST_TEAM_NAME), true);
        });
    });

    describe("multiple players, multiple teams, has different scores", () => {
        it("should return the team with most points", () => {
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 10, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 15, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[2], AVATAR_URL, 15, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[3], AVATAR_URL, 15, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.isTeamFirstPlace(SECOND_TEAM_NAME), true);
        });
    });

    describe("multiple players, multiple teams, tied score", () => {
        it("should return the two tied teams", () => {
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 5, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 7, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[2], AVATAR_URL, 7, 0);
            scoreboard.updateScoreboard(USER_TAG, USER_IDS[3], AVATAR_URL, 5, 0);
            assert.deepStrictEqual(scoreboard.getWinners(), [firstTeam, secondTeam]);
            assert.strictEqual(scoreboard.isTeamFirstPlace(FIRST_TEAM_NAME) && scoreboard.isTeamFirstPlace(SECOND_TEAM_NAME), true);
        });
    });
});

let guildPreference: GuildPreference;
describe("game finished", () => {
    beforeEach(() => {
        guildPreference = new GuildPreference("1234");
        guildPreference.setGoal(5);
        scoreboard.addTeam(FIRST_TEAM_NAME, new Player("user#0101", USER_IDS[0], AVATAR_URL, 0));
        scoreboard.addTeam(SECOND_TEAM_NAME, new Player("second_user#1010", USER_IDS[1], AVATAR_URL, 0));
    });

    describe("goal is not set", () => {
        it("should return false", () => {
            guildPreference.resetGoal();
            assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
        });
    });

    describe("goal is set", () => {
        describe("no one has a score yet", () => {
            it("should return false", () => {
                assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
            });
        });

        describe("first place is not equal/above the goal", () => {
            it("should return false", () => {
                scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 2, 0);
                scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 4, 0);
                assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
            });
        });

        describe("first place is equal/above the goal", () => {
            it("should return true", () => {
                scoreboard.updateScoreboard(USER_TAG, USER_IDS[0], AVATAR_URL, 5, 0);
                scoreboard.updateScoreboard(USER_TAG, USER_IDS[1], AVATAR_URL, 4, 0);
                assert.strictEqual(scoreboard.gameFinished(guildPreference), true);
            });
        });
    });
});
