/* eslint-disable prefer-arrow-callback */
import assert from "assert";
import Player from "../structures/player";
import Team from "../structures/team";

let team: Team;
let goodPlayer: Player;
let subparPlayer: Player;
let firstOnLeaderboardPlayer: Player;

beforeEach(function () {
    goodPlayer = new Player("ohmi#7183", "12345", "ohmipic", 0);
    subparPlayer = new Player("Cool#0001", "12", "url", 0);
    firstOnLeaderboardPlayer = new Player("kpop#1234", "121212", "kpop_pfp", 0);
    team = new Team("kmq", goodPlayer);
});

describe("add a teammate", function () {
    describe("add a player to a team", function () {
        it("should increase the size of the team and the team should include the new player", function () {
            team.addPlayer(subparPlayer);
            assert.strictEqual(team.getNumPlayers(), 2);
            assert.deepStrictEqual(team.getPlayers(), [subparPlayer, goodPlayer]);
        });
    });
});

describe("remove a teammate", function () {
    describe("remove a player from a team", function () {
        it("should decrease the size of the team and the team should now exclude that player", function () {
            team.addPlayer(subparPlayer);
            assert.strictEqual(team.getNumPlayers(), 2);
            team.removePlayer(subparPlayer.getId());
            assert.strictEqual(team.getNumPlayers(), 1);
            assert.deepStrictEqual(team.getPlayers(), [goodPlayer]);
        });
    });
});

describe("single player score", function () {
    describe("player's score is incremented multiple times", function () {
        it("should increment their score and give the score of that player", function () {
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                team.getPlayer(goodPlayer.id).incrementScore(1);
            }
            assert.strictEqual(team.getScore(), numIncrements);
            assert.strictEqual(team.getScore(), team.getPlayer(goodPlayer.id).getScore());
        });
    });
});

describe("multiple players score", function () {
    describe("two players' scores are incremented", function () {
        it("should increment both scores and the team's score should equal the sum of their scores", function () {
            team.addPlayer(subparPlayer);
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                team.getPlayer(goodPlayer.id).incrementScore(1);
                if (i % 5 === 0) {
                    team.getPlayer(goodPlayer.id).incrementScore(1);
                }
            }
            assert.strictEqual(team.getScore(), numIncrements + numIncrements / 5);
        });
    });
});

describe("score after removal", function () {
    describe("score of the team after a player is removed is the score of the remaining players", function () {
        it("should sum the scores of remaining players", function () {
            team.addPlayer(subparPlayer);
            team.addPlayer(firstOnLeaderboardPlayer);
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                team.getPlayers().map((p: Player) => p.incrementScore(1));
            }
            assert.deepStrictEqual(team.getPlayers(), [subparPlayer, goodPlayer, firstOnLeaderboardPlayer]);
            assert.strictEqual(team.getScore(), 75);

            team.removePlayer(subparPlayer.getId());
            assert.deepStrictEqual(team.getPlayers(), [goodPlayer, firstOnLeaderboardPlayer]);
            assert.strictEqual(team.getScore(), 50);

            team.removePlayer(firstOnLeaderboardPlayer.getId());
            assert.deepStrictEqual(team.getPlayers(), [goodPlayer]);
            assert.strictEqual(team.getScore(), 25);
        });
    });
});
