import assert from "assert";
import GuildPreference from "../structures/guild_preference";
import TeamScoreboard from "../structures/team_scoreboard";
import Player from "../structures/player";

const FIRST_TEAM_NAME = "kmq team";
const SECOND_TEAM_NAME = "not kmqer";

const FIRST_USERID = "12345";
const SECOND_USERID = "23456";
const TWO_USER_IDS = [FIRST_USERID, SECOND_USERID];
const FOUR_USER_IDS = [FIRST_USERID, SECOND_USERID, "252525", "1000000"];

const USER_TAG = "unused";
const AVATAR_URL = "avatarurl";

let scoreboard: TeamScoreboard;

/* eslint-disable prefer-arrow-callback */
beforeEach(function () {
    scoreboard = new TeamScoreboard();
    scoreboard.addTeam(FIRST_TEAM_NAME, new Player("user#0101", FIRST_USERID, AVATAR_URL, 0));
});

describe("team score/xp updating", function () {
    describe("single player, single team scoreboard", function () {
        describe("user guesses correctly multiple times", function () {
            it("should increment the user's score/xp, team score should be player's score, no bonus xp since 1 team", function () {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, FIRST_USERID, AVATAR_URL, 1, 50);
                    assert.strictEqual(scoreboard.getPlayerScore(FIRST_USERID), i + 1);
                    assert.strictEqual(scoreboard.getPlayerExpGain(FIRST_USERID), 50 * (i + 1));
                    assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), i + 1);
                }
            });
        });
        describe("user has not guessed yet", function () {
            it("should not increment the user's score/xp", function () {
                assert.strictEqual(scoreboard.getPlayerScore(FIRST_USERID), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(FIRST_USERID), 0);
                assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), 0);
            });
        });
    });

    describe("multi player, single team scoreboard", function () {
        beforeEach(function () {
            scoreboard.addPlayer(FIRST_TEAM_NAME, new Player("second_user#1010", SECOND_USERID, AVATAR_URL, 0));
        });
        describe("both users guess correctly multiple times", function () {
            it("should increment each user's score, team score should be sum of its players' scores", function () {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[0], AVATAR_URL, 1, 50);
                    if (i % 2 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[1], AVATAR_URL, 1, 50);
                    }
                }
                assert.strictEqual(scoreboard.getPlayerScore(TWO_USER_IDS[0]), 20);
                assert.strictEqual(scoreboard.getPlayerExpGain(TWO_USER_IDS[0]), 1000);
                assert.strictEqual(scoreboard.getPlayerScore(TWO_USER_IDS[1]), 10);
                assert.strictEqual(scoreboard.getPlayerExpGain(TWO_USER_IDS[1]), 500);
                assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), 30);
            });
        });
        describe("both users have not guessed yet", function () {
            it("should not increment each user's score", function () {
                assert.strictEqual(scoreboard.getPlayerScore(TWO_USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(TWO_USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerScore(TWO_USER_IDS[1]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(TWO_USER_IDS[1]), 0);
                assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), 0);
            });
        });
    });

    describe("multi player, multi team scoreboard", function () {
        beforeEach(function () {
            scoreboard.addPlayer(FIRST_TEAM_NAME, new Player("second_user#1010", SECOND_USERID, AVATAR_URL, 0));
            scoreboard.addTeam(SECOND_TEAM_NAME, new Player("IU#2325", FOUR_USER_IDS[2], AVATAR_URL, 0));
            scoreboard.addPlayer(SECOND_TEAM_NAME, new Player("g-dragon#9999", FOUR_USER_IDS[3], "dragon", 0));
        });

        describe("all users guess correctly multiple times", function () {
            it("should increment each user's score, winning team gets 10% bonus xp", function () {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[0], AVATAR_URL, 1, 50);
                    if (i % 2 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[1], AVATAR_URL, 1, 50);
                    }
                    if (i % 10 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[2], AVATAR_URL, 1, 50);
                    }
                    if (i % 20 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[3], AVATAR_URL, 1, 50);
                    }
                }
                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[0]), 20);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[0]), 1000 * 1.1);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[1]), 10);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[1]), 500 * 1.1);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[2]), 2);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[2]), 100);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[3]), 1);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[3]), 50);

                assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), 30);
                assert.strictEqual(scoreboard.getTeam(SECOND_TEAM_NAME).getScore(), 3);
            });
        });
        describe("some users guess correctly multiple times", function () {
            it("should increment each user's score", function () {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[0], AVATAR_URL, 1, 50);
                    if (i === 0) {
                        scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[1], AVATAR_URL, 1, 50);
                    }
                    if (i % 10 === 0) {
                        scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[2], AVATAR_URL, 1, 50);
                    }
                }
                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[0]), 20);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[0]), 1000 * 1.1);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[1]), 1);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[1]), 50 * 1.1);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[2]), 2);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[2]), 100);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[3]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[3]), 0);

                assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), 21);
                assert.strictEqual(scoreboard.getTeam(SECOND_TEAM_NAME).getScore(), 2);
            });
        });
        describe("all users have not guessed yet", function () {
            it("should not increment each user's score", function () {
                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[0]), 0);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[1]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[1]), 0);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[2]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[2]), 0);

                assert.strictEqual(scoreboard.getPlayerScore(FOUR_USER_IDS[3]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(FOUR_USER_IDS[3]), 0);

                assert.strictEqual(scoreboard.getTeam(FIRST_TEAM_NAME).getScore(), 0);
                assert.strictEqual(scoreboard.getTeam(SECOND_TEAM_NAME).getScore(), 0);
            });
        });
    });
});

beforeEach(function () {
    scoreboard = new TeamScoreboard();
    scoreboard.addTeam(FIRST_TEAM_NAME, new Player("user#0101", FIRST_USERID, AVATAR_URL, 0));
});

describe("team winner detection", function () {
    describe("nobody has a score yet", function () {
        it("should return an empty array", function () {
            assert.deepStrictEqual(scoreboard.getWinners(), []);
        });
    });

    describe("single player, single team, has score", function () {
        it("should return the team", function () {
            scoreboard.updateScoreboard(USER_TAG, FIRST_USERID, AVATAR_URL, 10, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].name, FIRST_TEAM_NAME);
            assert.strictEqual(scoreboard.isTeamFirstPlace(FIRST_TEAM_NAME), true);
        });
    });

    describe("multiple players, single team, has different scores", function () {
        it("should return the team", function () {
            scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[0], AVATAR_URL, 10, 0);
            scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[1], AVATAR_URL, 15, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].name, FIRST_TEAM_NAME);
            assert.strictEqual(scoreboard.isTeamFirstPlace(FIRST_TEAM_NAME), true);
        });
    });

    beforeEach(function () {
        scoreboard.addPlayer(FIRST_TEAM_NAME, new Player("sakura#5478", SECOND_USERID, AVATAR_URL, 0));
        scoreboard.addTeam(SECOND_TEAM_NAME, new Player("IU#2325", FOUR_USER_IDS[2], AVATAR_URL, 0));
        scoreboard.addPlayer(SECOND_TEAM_NAME, new Player("g-dragon#9999", FOUR_USER_IDS[3], "dragon", 0));
    });

    describe("multiple players, multiple teams, has different scores", function () {
        it("should return the team with most points", function () {
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[0], AVATAR_URL, 10, 0);
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[1], AVATAR_URL, 15, 0);
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[2], AVATAR_URL, 15, 0);
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[3], AVATAR_URL, 15, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.isTeamFirstPlace(SECOND_TEAM_NAME), true);
        });
    });

    describe("multiple players, multiple teams, tied score", function () {
        it("should return the two tied teams", function () {
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[0], AVATAR_URL, 5, 0);
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[1], AVATAR_URL, 7, 0);
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[2], AVATAR_URL, 7, 0);
            scoreboard.updateScoreboard(USER_TAG, FOUR_USER_IDS[3], AVATAR_URL, 5, 0);
            assert.strictEqual(scoreboard.getWinners().length, 2);
            assert.strictEqual(scoreboard.isTeamFirstPlace(FIRST_TEAM_NAME) && scoreboard.isTeamFirstPlace(SECOND_TEAM_NAME), true);
        });
    });
});

let guildPreference: GuildPreference;
describe("team game finished", function () {
    beforeEach(function () {
        guildPreference = new GuildPreference("1234");
        guildPreference.setGoal(5);
        scoreboard.addTeam(FIRST_TEAM_NAME, new Player("user#0101", FIRST_USERID, AVATAR_URL, 0));
        scoreboard.addTeam(SECOND_TEAM_NAME, new Player("second_user#1010", SECOND_USERID, AVATAR_URL, 0));
    });

    describe("goal is not set", function () {
        it("should return false", function () {
            guildPreference.resetGoal();
            assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
        });
    });

    describe("goal is set", function () {
        describe("no one has a score yet", function () {
            it("should return false", function () {
                assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
            });
        });
        describe("first place is not equal/above the goal", function () {
            it("should return false", function () {
                scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[0], AVATAR_URL, 2, 0);
                scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[1], AVATAR_URL, 4, 0);
                assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
            });
        });
        describe("first place is equal/above the goal", function () {
            it("should return true", function () {
                scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[0], AVATAR_URL, 5, 0);
                scoreboard.updateScoreboard(USER_TAG, TWO_USER_IDS[1], AVATAR_URL, 4, 0);
                assert.strictEqual(scoreboard.gameFinished(guildPreference), true);
            });
        });
    });
});
