/* eslint-disable prefer-arrow-callback */
import assert from "assert";
import Player from "../structures/player";
import Team from "../structures/team";

const goodPlayer = new Player("ohmi#7183", "12345", "ohmipic", 0);
const subparPlayer = new Player("Cool#0001", "12", "url", 0);
const firstOnLeaderboardPlayer = new Player("kpop#1234", "121212", "kpop_pfp", 0);

beforeEach(function () {
    this.team = new Team("kmq", goodPlayer);
});

describe("add a teammate", function () {
    describe("add a player to a team", function () {
        it("should increase the size of the team and the team should include the new player", function () {
            this.team.addPlayer(subparPlayer);
            assert.strictEqual(this.team.getNumPlayers(), 2);
            assert.strictEqual(this.team.getPlayers(), [goodPlayer, subparPlayer]);
        });
    });
});

describe("remove a teammate", function () {
    describe("remove a player from a team", function () {
        it("should decrease the size of the team and the team should now exclude that player", function () {
            this.team.addPlayer(subparPlayer);
            assert.strictEqual(this.team.getNumPlayers(), 2);
            this.team.removePlayer(subparPlayer);
            assert.strictEqual(this.team.getNumPlayers(), 1);
            assert.strictEqual(this.team.getPlayers(), [goodPlayer]);
        });
    });
});

describe("single player score", function () {
    describe("player's score is incremented multiple times", function () {
        it("should increment their score and give the score of that player", function () {
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                this.getPlayer(goodPlayer.id).incrementScore(1);
            }
            assert.strictEqual(this.team.getScore(), this.team.getPlayer(goodPlayer.id).getScore());
        });
    });
});

describe("multiple players score", function () {
    describe("two players' scores are incremented", function () {
        it("should increment both scores and the team's score should equal the sum of their scores", function () {
            this.team.addPlayer(subparPlayer);
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                this.team.getPlayer(goodPlayer.id).incrementScore(1);
                if (i % 5 === 0) {
                    this.team.getPlayer(goodPlayer.id).incrementScore(1);
                }
            }
            assert.strictEqual(this.team.getScore(), numIncrements + numIncrements / 5);
        });
    });
});

describe("score after removal", function () {
    describe("score of the team after a player is removed is the score of the remaining players", function () {
        it("should sum the scores of remaining players", function () {
            this.team.addPlayer(subparPlayer);
            this.team.addPlayer(firstOnLeaderboardPlayer);
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                this.team.getPlayers().map((p: Player) => p.incrementScore(1));
            }
            assert.strictEqual(this.team.getScore(), numIncrements * this.team.getNumPlayers());
            this.team.removePlayer(subparPlayer);
            assert.strictEqual(this.team.getScore(), numIncrements * this.team.getNumPlayers());
            this.team.removePlayer(firstOnLeaderboardPlayer);
            assert.strictEqual(this.team.getScore(), numIncrements * this.team.getNumPlayers());
        });
    });
});
