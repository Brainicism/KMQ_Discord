import Player from "../../../structures/player";
import Team from "../../../structures/team";
import assert from "assert";

describe("team", () => {
    let team: Team;
    let goodPlayer: Player;
    let subparPlayer: Player;
    let firstOnLeaderboardPlayer: Player;

    beforeEach(() => {
        goodPlayer = new Player("12345", "guildID", "ohmipic", 0, "ohmi");
        subparPlayer = new Player("12", "guildID", "url", 0, "cool");
        firstOnLeaderboardPlayer = new Player(
            "121212",
            "guildID",
            "kpop_pfp",
            0,
            "kpopper",
        );
        team = new Team("kmq", goodPlayer, "dummy");
    });

    describe("add a teammate", () => {
        describe("add a player to a team", () => {
            it("should increase the size of the team and the team should include the new player", () => {
                assert.strictEqual(team.hasPlayer(subparPlayer.id), false);
                team.addPlayer(subparPlayer);
                assert.strictEqual(team.getNumPlayers(), 2);
                assert.deepStrictEqual(team.getPlayers(), [
                    subparPlayer,
                    goodPlayer,
                ]);
                assert.strictEqual(team.hasPlayer(goodPlayer.id), true);
                assert.strictEqual(team.hasPlayer(subparPlayer.id), true);
                assert.strictEqual(
                    team.hasPlayer(firstOnLeaderboardPlayer.id),
                    false,
                );
            });
        });
    });

    describe("remove a teammate", () => {
        describe("remove a player from a team", () => {
            it("should decrease the size of the team and the team should now exclude that player", () => {
                team.addPlayer(subparPlayer);
                assert.strictEqual(team.hasPlayer(subparPlayer.id), true);
                assert.strictEqual(team.getNumPlayers(), 2);
                team.removePlayer(subparPlayer.id);
                assert.strictEqual(team.hasPlayer(subparPlayer.id), false);
                assert.strictEqual(team.getNumPlayers(), 1);
                assert.deepStrictEqual(team.getPlayers(), [goodPlayer]);
            });
        });
    });

    describe("single player score", () => {
        describe("player's score is incremented multiple times", () => {
            it("should increment their score and give the score of that player", () => {
                const numIncrements = 25;
                for (let i = 0; i < numIncrements; i++) {
                    team.getPlayer(goodPlayer.id)!.incrementScore(1);
                }

                assert.strictEqual(team.getScore(), numIncrements);
                assert.strictEqual(
                    team.getScore(),
                    team.getPlayer(goodPlayer.id)!.getScore(),
                );
            });
        });
    });

    describe("multiple players score", () => {
        describe("two players' scores are incremented", () => {
            it("should increment both scores and the team's score should equal the sum of their scores", () => {
                team.addPlayer(subparPlayer);
                const numIncrements = 25;
                for (let i = 0; i < numIncrements; i++) {
                    team.getPlayer(goodPlayer.id)!.incrementScore(1);
                    if (i % 5 === 0) {
                        team.getPlayer(goodPlayer.id)!.incrementScore(1);
                    }
                }

                assert.strictEqual(
                    team.getScore(),
                    numIncrements + numIncrements / 5,
                );
            });
        });
    });

    describe("score after removal", () => {
        describe("score of the team after a player is removed is the score of the remaining players", () => {
            it("should sum the scores of remaining players", () => {
                team.addPlayer(subparPlayer);
                team.addPlayer(firstOnLeaderboardPlayer);
                const numIncrements = 25;
                for (let i = 0; i < numIncrements; i++) {
                    team.getPlayers().map((p: Player) => p.incrementScore(1));
                }

                assert.deepStrictEqual(team.getPlayers(), [
                    subparPlayer,
                    goodPlayer,
                    firstOnLeaderboardPlayer,
                ]);
                assert.strictEqual(team.getScore(), 75);

                team.removePlayer(subparPlayer.id);
                assert.deepStrictEqual(team.getPlayers(), [
                    goodPlayer,
                    firstOnLeaderboardPlayer,
                ]);
                assert.strictEqual(team.getScore(), 50);

                team.removePlayer(firstOnLeaderboardPlayer.id);
                assert.deepStrictEqual(team.getPlayers(), [goodPlayer]);
                assert.strictEqual(team.getScore(), 25);
            });
        });
    });
});
