import * as discordUtils from "../../../helpers/discord_utils";
import { LEADERBOARD_ENTRIES_PER_PAGE } from "../../../constants";
import { describe } from "mocha";
import GameSession from "../../../structures/game_session";
import GameType from "../../../enums/game_type";
import GuildPreference from "../../../structures/guild_preference";
import KmqMember from "../../../structures/kmq_member";
import LeaderboardCommand from "../../../commands/game_commands/leaderboard";
import LeaderboardDuration from "../../../enums/option_types/leaderboard_duration";
import LeaderboardScope from "../../../enums/option_types/leaderboard_scope";
import LeaderboardType from "../../../enums/option_types/leaderboard_type";
import MessageContext from "../../../structures/message_context";
import Player from "../../../structures/player";
import State from "../../../state";
import assert from "assert";
import dbContext from "../../../database_context";
import sinon from "sinon";
import type { EmbedGenerator } from "eris-pagination";
import type Eris from "eris";

const SERVER_ID = "0";
const gameStarter = new KmqMember("123");
const messageContext = new MessageContext("", gameStarter, SERVER_ID, "");
const guildID = "guild_id";
const avatarURL = "avatar_URL";
const INITIAL_MONTH = 5;
const INITIAL_DAY = 14;
const INITIAL_HOUR = 6;
const INITIAL_MINUTE = 35;
const INITIAL_SECONDS = 3;
const date = new Date(
    2025,
    INITIAL_MONTH,
    INITIAL_DAY,
    INITIAL_HOUR,
    INITIAL_MINUTE,
    INITIAL_SECONDS,
);

const secondAgo = new Date(new Date(date).setSeconds(INITIAL_SECONDS - 1));
const yesterday = new Date(new Date(date).setDate(INITIAL_DAY - 1));
const lastWeek = new Date(new Date(date).setDate(INITIAL_DAY - 7));
const lastMonth = new Date(new Date(date).setMonth(INITIAL_MONTH - 1));

const INITIAL_TOTAL_ENTRIES = LEADERBOARD_ENTRIES_PER_PAGE * 5;

function getMockGuildPreference(): GuildPreference {
    const guildPreference = new GuildPreference("test");
    sinon.stub(guildPreference, "updateGuildPreferences");
    return guildPreference;
}

interface PlayerGameSessionStat {
    player_id: string;
    date: Date;
    songs_guessed: number;
    exp_gained: number;
    levels_gained: number;
}

interface PlayerStat {
    player_id: string;
    songs_guessed: number;
    games_played: number;
    exp: number;
    level: number;
}

interface PlayerServer {
    player_id: string;
    server_id: string;
}

function generatePlayerStats(
    numberPlayers: number,
    offset = 0,
): Array<PlayerStat> {
    return [...Array(numberPlayers).keys()].map((i) => ({
        player_id: String(i + offset),
        songs_guessed: i,
        games_played: i,
        exp: i + 1,
        level: i,
    }));
}

function generatePlayerServers(
    numberPlayers: number,
    serverID: string,
): Array<PlayerServer> {
    return [...Array(numberPlayers).keys()].map((i) => ({
        player_id: String(i),
        server_id: serverID,
    }));
}

async function getNumberOfFields(
    embedGenerators: EmbedGenerator[],
): Promise<number> {
    return embedGenerators.reduce(
        async (prev, curr) =>
            (await prev) + ((await curr()).fields as Eris.EmbedField[]).length,
        Promise.resolve(0),
    );
}

describe("leaderboard command", () => {
    let guildPreference: GuildPreference;
    const sandbox = sinon.createSandbox();

    describe("getLeaderboardEmbeds", () => {
        describe("off by one errors", () => {
            beforeEach(async () => {
                await dbContext.kmq.deleteFrom("player_stats").execute();
            });

            describe("fits a page perfectly", () => {
                it("should match the number of pages and embeds", async () => {
                    const totalEntries = LEADERBOARD_ENTRIES_PER_PAGE;
                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(generatePlayerStats(totalEntries))
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.EXP,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);
                    assert.strictEqual(
                        pageCount,
                        Math.ceil(totalEntries / LEADERBOARD_ENTRIES_PER_PAGE),
                    );
                    assert.strictEqual(fields, totalEntries);
                });
            });

            describe("one full page + 1 field", () => {
                it("should match the number of pages and embeds", async () => {
                    const totalEntries = LEADERBOARD_ENTRIES_PER_PAGE + 1;
                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(generatePlayerStats(totalEntries))
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.EXP,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);
                    assert.strictEqual(
                        pageCount,
                        Math.ceil(totalEntries / LEADERBOARD_ENTRIES_PER_PAGE),
                    );
                    assert.strictEqual(fields, totalEntries);
                });
            });

            describe("one field short of a full page", () => {
                it("should match the number of pages and embeds", async () => {
                    const totalEntries = LEADERBOARD_ENTRIES_PER_PAGE - 1;
                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(generatePlayerStats(totalEntries))
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.EXP,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(totalEntries / LEADERBOARD_ENTRIES_PER_PAGE),
                    );
                    assert.strictEqual(fields, totalEntries);
                });
            });
        });

        describe("invoker indicator", () => {
            beforeEach(async () => {
                await dbContext.kmq.deleteFrom("player_stats").execute();
            });

            it("should show the invoker indicator", async () => {
                await dbContext.kmq
                    .insertInto("player_stats")
                    .values(generatePlayerStats(INITIAL_TOTAL_ENTRIES))
                    .execute();

                // invoker's position
                const invokerPosition = 3;

                const { embeds } =
                    await LeaderboardCommand.getLeaderboardEmbeds(
                        messageContext,
                        LeaderboardType.EXP,
                        LeaderboardScope.GLOBAL,
                        LeaderboardDuration.ALL_TIME,
                        String(INITIAL_TOTAL_ENTRIES - invokerPosition),
                    );

                const generatedEmbeds = await Promise.all(
                    embeds.map((x) => x()),
                );

                // invoker has an indicator, every other entry doesn't
                assert.strict(
                    generatedEmbeds[0]!.fields!.every((field, idx) => {
                        if (idx === invokerPosition - 1) {
                            return field.name.includes("\\➡");
                        }

                        return !field.name.includes("\\➡");
                    }),
                );
            });
        });

        describe("all-time leaderboard", () => {
            describe("global leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq.deleteFrom("player_stats").execute();
                });

                it("should match the number of pages and embeds", async () => {
                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(generatePlayerStats(INITIAL_TOTAL_ENTRIES))
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.EXP,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            INITIAL_TOTAL_ENTRIES /
                                LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, INITIAL_TOTAL_ENTRIES);
                });
            });

            describe("server leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq.deleteFrom("player_stats").execute();
                    await dbContext.kmq.deleteFrom("player_servers").execute();
                });

                it("should match the number of pages and embeds", async () => {
                    const statsRows: Array<PlayerStat> = [];
                    const serversRows: Array<PlayerServer> = [];

                    statsRows.push(
                        ...generatePlayerStats(INITIAL_TOTAL_ENTRIES),
                    );

                    serversRows.push(
                        ...generatePlayerServers(
                            INITIAL_TOTAL_ENTRIES,
                            SERVER_ID,
                        ),
                    );

                    // invalid -- players outside of server
                    statsRows.push(
                        ...generatePlayerStats(5, INITIAL_TOTAL_ENTRIES),
                    );

                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(statsRows)
                        .execute();

                    await dbContext.kmq
                        .insertInto("player_servers")
                        .values(serversRows)
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.EXP,
                            LeaderboardScope.SERVER,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            INITIAL_TOTAL_ENTRIES /
                                LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, INITIAL_TOTAL_ENTRIES);
                });
            });

            describe("game leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq.deleteFrom("player_stats").execute();
                    guildPreference = getMockGuildPreference();
                });

                it("should match the number of pages and embeds", async () => {
                    sandbox
                        .stub(discordUtils, "getCurrentVoiceMembers")
                        .callsFake((_voiceChannelID) => []);
                    const gameSession = new GameSession(
                        guildPreference,
                        "",
                        "",
                        SERVER_ID,
                        gameStarter,
                        GameType.CLASSIC,
                    );

                    sandbox.restore();

                    State.gameSessions = { [SERVER_ID]: gameSession };
                    const statsRows: Array<PlayerStat> = [];

                    statsRows.push(
                        ...generatePlayerStats(INITIAL_TOTAL_ENTRIES),
                    );

                    [...Array(INITIAL_TOTAL_ENTRIES).keys()].map((i) =>
                        gameSession.scoreboard.addPlayer(
                            new Player(
                                i.toString(),
                                guildID,
                                avatarURL,
                                0,
                                i.toString(),
                            ),
                        ),
                    );

                    // invalid -- not in game
                    statsRows.push(
                        ...generatePlayerStats(5, INITIAL_TOTAL_ENTRIES),
                    );

                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(statsRows)
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.EXP,
                            LeaderboardScope.GAME,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            INITIAL_TOTAL_ENTRIES /
                                LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, INITIAL_TOTAL_ENTRIES);
                });
            });

            describe("games played leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq.deleteFrom("player_stats").execute();
                });

                it("should match the number of pages and embeds", async () => {
                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(generatePlayerStats(INITIAL_TOTAL_ENTRIES))
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.GAMES_PLAYED,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            INITIAL_TOTAL_ENTRIES /
                                LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, INITIAL_TOTAL_ENTRIES);
                });
            });

            describe("songs guessed leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq.deleteFrom("player_stats").execute();
                });

                it("should match the number of pages and embeds", async () => {
                    await dbContext.kmq
                        .insertInto("player_stats")
                        .values(generatePlayerStats(INITIAL_TOTAL_ENTRIES))
                        .execute();

                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.SONGS_GUESSED,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.ALL_TIME,
                            "1",
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            INITIAL_TOTAL_ENTRIES /
                                LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, INITIAL_TOTAL_ENTRIES);
                });
            });
        });

        describe("temporary leaderboard", () => {
            beforeEach(async () => {
                await dbContext.kmq
                    .deleteFrom("player_game_session_stats")
                    .execute();

                const rows = [
                    {
                        player_id: "0",
                        date,
                        songs_guessed: 1,
                        exp_gained: 1,
                        levels_gained: 1,
                    },
                    {
                        player_id: "1",
                        date: secondAgo,
                        songs_guessed: 1,
                        exp_gained: 1,
                        levels_gained: 1,
                    },
                    {
                        player_id: "2",
                        date: yesterday,
                        songs_guessed: 1,
                        exp_gained: 1,
                        levels_gained: 1,
                    },
                    {
                        player_id: "3",
                        date: lastWeek,
                        songs_guessed: 1,
                        exp_gained: 1,
                        levels_gained: 1,
                    },
                    {
                        player_id: "4",
                        date: lastMonth,
                        songs_guessed: 1,
                        exp_gained: 1,
                        levels_gained: 1,
                    },
                ];

                for (let i = 5; i < INITIAL_TOTAL_ENTRIES; i++) {
                    rows.push({
                        player_id: String(i),
                        date,
                        songs_guessed: i,
                        exp_gained: 1,
                        levels_gained: 1,
                    });
                }

                await dbContext.kmq
                    .insertInto("player_game_session_stats")
                    .values(rows)
                    .execute();
            });

            describe("global leaderboard", () => {
                describe("daily leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry yesterday
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 3;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.GLOBAL,
                                LeaderboardDuration.DAILY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);
                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("weekly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 2;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.GLOBAL,
                                LeaderboardDuration.WEEKLY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("monthly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 1;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.GLOBAL,
                                LeaderboardDuration.MONTHLY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });
            });

            describe("server leaderboard", () => {
                beforeEach(async () => {
                    await dbContext.kmq.deleteFrom("player_servers").execute();

                    const serversRows: Array<PlayerServer> = [];
                    // Player with id 0 is outside server
                    for (let i = 1; i <= INITIAL_TOTAL_ENTRIES; i++) {
                        serversRows.push({
                            player_id: String(i),
                            server_id: SERVER_ID,
                        });
                    }

                    await dbContext.kmq
                        .insertInto("player_servers")
                        .values(serversRows)
                        .execute();
                });

                describe("daily leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside server
                        // Ignoring entry yesterday
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 4;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.SERVER,
                                LeaderboardDuration.DAILY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("weekly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside server
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 3;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.SERVER,
                                LeaderboardDuration.WEEKLY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("monthly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside server
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 2;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.SERVER,
                                LeaderboardDuration.MONTHLY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });
            });

            describe("game leaderboard", () => {
                beforeEach(() => {
                    sandbox
                        .stub(discordUtils, "getCurrentVoiceMembers")
                        .callsFake((_voiceChannelID) => []);
                    const gameSession = new GameSession(
                        guildPreference,
                        "",
                        "",
                        SERVER_ID,
                        gameStarter,
                        GameType.CLASSIC,
                    );

                    sandbox.restore();

                    State.gameSessions = { [SERVER_ID]: gameSession };

                    // Player with id 0 is not in game
                    [...Array(INITIAL_TOTAL_ENTRIES).keys()]
                        .filter((x) => x !== 0)
                        .map((i) =>
                            gameSession.scoreboard.addPlayer(
                                new Player(
                                    i.toString(),
                                    guildID,
                                    avatarURL,
                                    0,
                                    i.toString(),
                                ),
                            ),
                        );
                });

                describe("daily leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside game
                        // Ignoring entry yesterday
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 4;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.GAME,
                                LeaderboardDuration.DAILY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("weekly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside game
                        // Ignoring entry last week
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 3;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.GAME,
                                LeaderboardDuration.WEEKLY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });

                describe("monthly leaderboard", () => {
                    it("should match the number of pages and embeds", async () => {
                        // Ignoring entry of player outside game
                        // Ignoring entry last month
                        const validEntryCount = INITIAL_TOTAL_ENTRIES - 2;
                        const { embeds, pageCount } =
                            await LeaderboardCommand.getLeaderboardEmbeds(
                                messageContext,
                                LeaderboardType.EXP,
                                LeaderboardScope.GAME,
                                LeaderboardDuration.MONTHLY,
                                "1",
                                date,
                            );

                        const fields = await getNumberOfFields(embeds);

                        assert.strictEqual(
                            pageCount,
                            Math.ceil(
                                validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                            ),
                        );
                        assert.strictEqual(fields, validEntryCount);
                    });
                });
            });

            describe("games played leaderboard", () => {
                it("should match the number of pages and embeds", async () => {
                    const rows: Array<PlayerGameSessionStat> = [];
                    for (let i = 0; i < 10; i++) {
                        rows.push({
                            player_id: "1",
                            date: new Date(
                                new Date(date).setMinutes(INITIAL_MINUTE - i),
                            ),
                            songs_guessed: i,
                            exp_gained: 1,
                            levels_gained: 1,
                        });
                    }

                    await dbContext.kmq
                        .insertInto("player_game_session_stats")
                        .values(rows)
                        .execute();

                    // Counting distinct entries only -- player "0" has two entries, player "1" has 11 entries
                    const validEntryCount = INITIAL_TOTAL_ENTRIES - 1;
                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.GAMES_PLAYED,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.MONTHLY,
                            "1",
                            date,
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, validEntryCount);
                });
            });

            describe("songs guessed leaderboard", () => {
                it("should match the number of pages and embeds", async () => {
                    const rows: Array<PlayerGameSessionStat> = [];
                    for (let i = 0; i < 10; i++) {
                        rows.push({
                            player_id: "1",
                            date: new Date(
                                new Date(date).setMinutes(INITIAL_MINUTE - i),
                            ),
                            songs_guessed: i,
                            exp_gained: 1,
                            levels_gained: 1,
                        });
                    }

                    await dbContext.kmq
                        .insertInto("player_game_session_stats")
                        .values(rows)
                        .execute();

                    // Counting distinct entries only -- player "0" has two entries, player "1" has 11 entries
                    const validEntryCount = INITIAL_TOTAL_ENTRIES - 1;
                    const { embeds, pageCount } =
                        await LeaderboardCommand.getLeaderboardEmbeds(
                            messageContext,
                            LeaderboardType.GAMES_PLAYED,
                            LeaderboardScope.GLOBAL,
                            LeaderboardDuration.MONTHLY,
                            "1",
                            date,
                        );

                    const fields = await getNumberOfFields(embeds);

                    assert.strictEqual(
                        pageCount,
                        Math.ceil(
                            validEntryCount / LEADERBOARD_ENTRIES_PER_PAGE,
                        ),
                    );
                    assert.strictEqual(fields, validEntryCount);
                });
            });
        });
    });
});
