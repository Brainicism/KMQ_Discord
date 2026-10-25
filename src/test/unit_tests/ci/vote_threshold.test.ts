import EliminationPlayer from "../../../structures/elimination_player";
import EliminationScoreboard from "../../../structures/elimination_scoreboard";
import GameType from "../../../enums/game_type";
import HintCommand from "../../../commands/game_commands/hint";
import SkipCommand from "../../../commands/game_commands/skip";
import assert from "assert";
import type GameSession from "../../../structures/game_session";
import type Session from "../../../structures/session";

const ALIVE = ["alive1", "alive2"];
const ELIMINATED = ["out1", "out2", "out3"];

/**
 * @param gameType - the session's game type
 * @param voteMajorityCount - the participant-based majority
 * @returns a session stub with 2 alive and 3 eliminated players
 */
function mockSession(
    gameType: GameType,
    voteMajorityCount: number,
): GameSession {
    const scoreboard = new EliminationScoreboard(1, "vc");
    for (const id of ALIVE) {
        scoreboard.addPlayer(new EliminationPlayer(id, "guild", null, 1, id));
    }

    for (const id of ELIMINATED) {
        scoreboard.addPlayer(new EliminationPlayer(id, "guild", null, 0, id));
    }

    const skippers = new Set<string>();
    return {
        gameType,
        scoreboard,
        isGameSession: () => true,
        getVoteMajorityCount: () => voteMajorityCount,
        round: {
            userSkipped: (id: string) => skippers.add(id),
            getSkipCount: () => skippers.size,
            getHintRequests: () => 0,
        },
    } as unknown as GameSession;
}

describe("vote thresholds", () => {
    describe("elimination", () => {
        const session = mockSession(GameType.ELIMINATION, 3);

        it("skip and hint need a majority of the remaining players", () => {
            assert.strictEqual(SkipCommand.getSkipThreshold(session), 2);
            assert.strictEqual(HintCommand.getHintThreshold(session), 2);
        });

        it("the skip counter shows that threshold", () => {
            assert.strictEqual(SkipCommand.getSkipCounter(session), "0/2");
        });

        it("eliminated players can't vote to skip", () => {
            for (const id of ELIMINATED) {
                assert.strictEqual(
                    SkipCommand.canVoteToSkip(session, id),
                    false,
                );
            }

            for (const id of ALIVE) {
                assert.strictEqual(
                    SkipCommand.canVoteToSkip(session, id),
                    true,
                );
            }
        });
    });

    describe("classic", () => {
        const session = mockSession(GameType.CLASSIC, 3);

        it("skip and hint use the participant majority", () => {
            assert.strictEqual(SkipCommand.getSkipThreshold(session), 3);
            assert.strictEqual(HintCommand.getHintThreshold(session), 3);
            assert.strictEqual(
                SkipCommand.getSkipCounter(session as unknown as Session),
                "0/3",
            );
        });

        it("everyone can vote to skip", () => {
            for (const id of [...ALIVE, ...ELIMINATED]) {
                assert.strictEqual(
                    SkipCommand.canVoteToSkip(session, id),
                    true,
                );
            }
        });
    });
});
