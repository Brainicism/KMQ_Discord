/* eslint-disable @typescript-eslint/no-use-before-define */
import { URL } from "url";
import pluralize from "pluralize";
import dbContext from "./database_context";
import {
    chooseRandom,
    getOrdinalNum,
    weekOfYear,
    friendlyFormattedNumber,
} from "./helpers/utils";
import { IPCLogger } from "./logger";

const logger = new IPCLogger("fact_generator");

const musicShows = {
    inkigayo: "Inkigayo",
    countdown: "Countdown",
    theshow: "The Show",
    musiccore: "Show! Music Core",
    musicbank: "Music Bank",
    showchampion: "Show Champion",
};

const funFactFunctions = [
    recentMusicVideos,
    recentMilestone,
    recentMusicShowWin,
    musicShowWins,
    mostViewedGroups,
    mostLikedGroups,
    mostViewedVideo,
    mostLikedVideo,
    mostMusicVideos,
    yearWithMostDebuts,
    yearWithMostReleases,
    viewsByGender,
    mostViewedSoloArtist,
    viewsBySolo,
    bigThreeDominance,
    mostGaonFirsts,
    mostGaonAppearances,
    historicalGaonWeekly,
    recentGaonWeekly,
    fanclubName,
    closeBirthdays,
    mostArtistsEntertainmentCompany,
    mostViewedEntertainmentCompany,
    songReleaseAnniversaries,
];

const kmqFactFunctions = [
    longestGame,
    mostGames,
    mostCorrectGuessed,
    globalTotalGames,
    recentGameSessions,
    recentGames,
    mostSongsGuessedPlayer,
    mostGamesPlayedPlayer,
    recentUniquePlayers,
    topLeveledPlayers,
    songGuessRate,
];

let factCache: {
    funFacts: string[][];
    kmqFacts: string[][];
    lastUpdated: number;
} = {
    funFacts: [],
    kmqFacts: [],
    lastUpdated: null,
};

interface GaonWeeklyEntry {
    songName: string;
    artistName: string;
    artistID?: string;
    songID?: string;
    year: string;
}

export async function reloadFactCache(): Promise<void> {
    logger.info("Regenerating fact cache...");
    await generateFacts();
}

async function resolveFactPromises(
    promises: Promise<string[]>[]
): Promise<string[][]> {
    const settledPromises = await Promise.allSettled(promises);
    const rejectedPromises = settledPromises.filter(
        (x) => x["status"] === "rejected"
    ) as PromiseRejectedResult[];

    for (const rejectedPromise of rejectedPromises) {
        logger.error(`Failed to evaluate fact: ${rejectedPromise.reason}`);
    }

    const resolvedPromises = settledPromises.filter(
        (x) => x["status"] === "fulfilled"
    ) as PromiseFulfilledResult<string[]>[];

    return resolvedPromises.map((x) => x["value"]);
}

async function generateFacts(): Promise<void> {
    const funFactPromises = funFactFunctions.map((x) => x());
    const kmqFactPromises = kmqFactFunctions.map((x) => x());
    const funFacts = await resolveFactPromises(funFactPromises);
    const kmqFacts = await resolveFactPromises(kmqFactPromises);
    factCache = {
        funFacts: funFacts.filter((facts) => facts.length > 0),
        kmqFacts: kmqFacts.filter((facts) => facts.length > 0),
        lastUpdated: Date.now(),
    };
}

function parseGaonWeeklyRankList(
    ranklist: string,
    year: string
): Array<GaonWeeklyEntry> {
    return JSON.parse(ranklist).map((x) => {
        const songName = x[0];
        const artistName = x[1];
        const artistID = x[2] || null;
        const songID = x[3] || null;
        return {
            songName,
            artistName,
            artistID,
            songID,
            year,
        };
    });
}

export function getFact(): string {
    const randomVal = Math.random();
    const factGroup =
        randomVal < 0.85 ? factCache.funFacts : factCache.kmqFacts;

    if (factGroup.length === 0) return null;
    return chooseRandom(chooseRandom(factGroup));
}

async function recentMusicVideos(): Promise<string[]> {
    const oneMonthPriorDate = new Date();
    oneMonthPriorDate.setMonth(oneMonthPriorDate.getMonth() - 1);
    const result = await dbContext
        .kpopVideos("kpop_videos.app_kpop")
        .select([
            "app_kpop.name as name",
            "app_kpop_group.name as artist",
            "vlink as youtubeLink",
            "publishedon",
        ])
        .join("kpop_videos.app_kpop_group", function join() {
            this.on(
                "kpop_videos.app_kpop.id_artist",
                "=",
                "kpop_videos.app_kpop_group.id"
            );
        })
        .andWhere("vtype", "main")
        .andWhere("publishedon", ">", oneMonthPriorDate)
        .orderBy("kpop_videos.app_kpop.publishedon", "DESC");

    if (result.length === 0) {
        logger.warn("recentMusicVideos generated no facts");
        return [];
    }

    return result.map(
        (x) =>
            `New Song Alert: Check out this recently released music video, ["${x["name"]}" by ${x["artist"]}](https://youtu.be/${x["youtubeLink"]})`
    );
}

async function recentMilestone(): Promise<string[]> {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 14);
    const result = await dbContext
        .kpopVideos("app_kpop_miles")
        .select([
            "app_kpop_miles.mvalue as milestone_views",
            "app_kpop.name as song_name",
            "app_kpop_group.name as artist_name",
            "app_kpop.vlink as link",
        ])
        .where("date", ">", twoWeeksPriorDate)
        .join("app_kpop", function join() {
            this.on("app_kpop.id", "=", "app_kpop_miles.id_mv");
        })
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        });

    if (result.length === 0) {
        logger.warn("recentMilestone generated no facts");
        return [];
    }

    return result.map(
        (x) =>
            `Fun Fact: ${generateSongArtistHyperlink(
                x["song_name"],
                x["artist_name"],
                x["link"]
            )} recently reached ${friendlyFormattedNumber(
                x["milestone_views"]
            )} views on YouTube!`
    );
}

async function recentMusicShowWin(): Promise<string[]> {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 7);
    const result = await dbContext
        .kpopVideos("app_kpop_ms")
        .select([
            "app_kpop_ms.musicshow as music_show",
            "app_kpop_ms.date as win_date",
            "app_kpop_ms.musicname as winning_song",
            "app_kpop_group.name as artist_name",
            "app_kpop.vlink as link",
        ])
        .where("date", ">", twoWeeksPriorDate)
        .where("app_kpop_ms.id_musicvideo", "!=", 0)
        .join("app_kpop_group", function join() {
            this.on("app_kpop_ms.id_artist", "=", "app_kpop_group.id");
        })
        .join("app_kpop", function join() {
            this.on("app_kpop_ms.id_musicvideo", "=", "app_kpop.vlink");
        });

    if (result.length === 0) {
        logger.warn("recentMusicShowWin generated no facts");
        return [];
    }

    return result.map(
        (x) =>
            `Fun Fact: ${generateSongArtistHyperlink(
                x["winning_song"],
                x["artist_name"],
                x["link"]
            )} recently won on ${musicShows[x["music_show"]]} on ${x["win_date"]
                .toISOString()
                .substring(0, 10)}!`
    );
}

async function musicShowWins(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_ms")
        .select(["app_kpop_group.name as artist_name"])
        .count("app_kpop_ms.id_artist as count")
        .groupBy("app_kpop_ms.id_artist")
        .having("count", ">=", 5)
        .join("app_kpop_group", function join() {
            this.on("app_kpop_ms.id_artist", "=", "app_kpop_group.id");
        })
        .orderBy("count", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["artist_name"]} has won the ${getOrdinalNum(
                idx + 1
            )} most music show with ${x["count"]} wins!`
    );
}

async function mostViewedGroups(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop_group.issolo", "=", "n")
        .orderBy("total_views", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["artist_name"]} is the ${getOrdinalNum(
                idx + 1
            )} most viewed group with ${friendlyFormattedNumber(
                x["total_views"]
            )} total YouTube views!`
    );
}

async function mostLikedGroups(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.likes as total_likes")
        .groupBy("app_kpop.id_artist")
        .limit(25)
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop_group.issolo", "=", "n")
        .orderBy("total_likes", "DESC");

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["artist_name"]} is the ${getOrdinalNum(
                idx + 1
            )} most liked group with ${friendlyFormattedNumber(
                x["total_likes"]
            )} total YouTube likes!`
    );
}

async function mostViewedVideo(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select([
            "app_kpop_group.name as artist_name",
            "app_kpop.name as song_name",
            "app_kpop.views as views",
            "app_kpop.vlink as link",
        ])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop.vtype", "main")
        .orderBy("views", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${generateSongArtistHyperlink(
                x["song_name"],
                x["artist_name"],
                x["link"]
            )} is the ${getOrdinalNum(
                idx + 1
            )} most viewed music video with ${friendlyFormattedNumber(
                x["views"]
            )} YouTube views!`
    );
}

async function mostLikedVideo(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select([
            "app_kpop_group.name as artist_name",
            "app_kpop.name as song_name",
            "app_kpop.likes as likes",
            "app_kpop.vlink as link",
        ])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .orderBy("likes", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${generateSongArtistHyperlink(
                x["song_name"],
                x["artist_name"],
                x["link"]
            )} is the ${getOrdinalNum(
                idx + 1
            )} most liked music video with ${friendlyFormattedNumber(
                x["likes"]
            )} YouTube likes!`
    );
}

async function mostViewedEntertainmentCompany(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_company.name as name"])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .join("app_kpop_company", function join() {
            this.on("app_kpop_company.id", "=", "app_kpop_group.id_company");
        })
        .groupBy("app_kpop_group.id_company")
        .sum("app_kpop.views as views")
        .orderBy("views", "DESC")
        .limit(15);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${
                x["name"]
            } is the entertainment company with the ${getOrdinalNum(
                idx + 1
            )} most YouTube views at ${friendlyFormattedNumber(x["views"])}!`
    );
}

async function mostArtistsEntertainmentCompany(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["app_kpop_company.name as name"])
        .join("app_kpop_company", function join() {
            this.on("app_kpop_company.id", "=", "app_kpop_group.id_company");
        })
        .where("is_collab", "=", "n")
        .groupBy("app_kpop_group.id_company")
        .count("* as count")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${
                x["name"]
            } is the entertainment company with the ${getOrdinalNum(
                idx + 1
            )} most artists (including subunits and solo debuts) at ${
                x["count"]
            }!`
    );
}

async function mostMusicVideos(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .where("vtype", "=", "main")
        .count("app_kpop.id_artist as count")
        .groupBy("id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .orderBy("count", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["artist_name"]} has the ${getOrdinalNum(
                idx + 1
            )} most music videos with ${x["count"]} on YouTube!`
    );
}

async function yearWithMostDebuts(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select("app_kpop_group.formation as formation_year")
        .count("app_kpop_group.id as count")
        .where("formation", "!=", 0)
        .groupBy("app_kpop_group.formation")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["formation_year"]} had the ${getOrdinalNum(
                idx + 1
            )} most debuts with ${x["count"]} groups debuting!`
    );
}

async function yearWithMostReleases(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(
            dbContext.kpopVideos.raw(
                "YEAR(app_kpop.publishedon) as release_year"
            )
        )
        .count("* as count")
        .where("app_kpop.vtype", "=", "main")
        .groupBy("release_year")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["release_year"]} was the ${getOrdinalNum(
                idx + 1
            )} most active year in K-Pop with ${
                x["count"]
            } music video releases!`
    );
}

async function viewsByGender(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.members as gender"])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .groupBy("app_kpop_group.members")
        .sum("app_kpop.views as views")
        .orderBy("views", "DESC")
        .limit(25);

    const data: any = {};
    let totalViews = 0;
    for (const genderViews of result) {
        totalViews += genderViews.views;
    }

    for (const genderViews of result) {
        data[genderViews.gender] = {
            views: friendlyFormattedNumber(genderViews.views),
            proportion: ((100 * genderViews.views) / totalViews).toFixed(2),
        };
    }

    return [
        `Fun Fact: There is a combined total of ${friendlyFormattedNumber(
            totalViews
        )} views on all K-Pop music videos on YouTube. ${data.male.views} (${
            data.male.proportion
        }%) of which are from male, ${data.female.views} (${
            data.female.proportion
        }%) from female, and the remaining ${data.coed.views} (${
            data.coed.proportion
        }%) from co-ed groups!`,
    ];
}

async function mostViewedSoloArtist(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop_group.issolo", "=", "y")
        .orderBy("total_views", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${x["artist_name"]} is the ${getOrdinalNum(
                idx + 1
            )} most viewed solo artist with ${friendlyFormattedNumber(
                x["total_views"]
            )} total YouTube views!`
    );
}

async function viewsBySolo(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.issolo as issolo"])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .groupBy("app_kpop_group.issolo")
        .sum("app_kpop.views as views")
        .orderBy("issolo", "DESC")
        .limit(25);

    const totalViews = result[0].views + result[1].views;
    const data = {
        group: {
            views: friendlyFormattedNumber(result[0].views),
            proportion: ((100 * result[0].views) / totalViews).toFixed(2),
        },
        solo: {
            views: friendlyFormattedNumber(result[1].views),
            proportion: ((100 * result[1].views) / totalViews).toFixed(2),
        },
    };

    return [
        `Fun Fact: There is a combined total of ${friendlyFormattedNumber(
            totalViews
        )} views on all K-Pop music videos on YouTube. ${data.group.views} (${
            data.group.proportion
        }%) of which are groups, while ${data.solo.views} (${
            data.solo.proportion
        }%) are from solo artists!`,
    ];
}

async function songReleaseAnniversaries(): Promise<string[]> {
    const result = await dbContext
        .kmq("available_songs")
        .select(
            dbContext.kmq.raw(
                "song_name, artist_name, YEAR(publishedon) as publish_year, link"
            )
        )
        .whereRaw("WEEK(publishedon) = WEEK(NOW())")
        .andWhereRaw("YEAR(publishedon) != YEAR(NOW())")
        .orderBy("views", "DESC")
        .limit(25);

    return result.map(
        (x) =>
            `Fun Fact: ${generateSongArtistHyperlink(
                x["song_name"],
                x["artist_name"],
                x["link"]
            )} was released this week back in ${x["publish_year"]}`
    );
}

async function songGuessRate(): Promise<string[]> {
    const result = await dbContext
        .kmq("song_guess_count")
        .select(
            dbContext.kmq.raw(
                "song_name, artist_name, ROUND(correct_guesses/rounds_played * 100, 2) as c, link, rounds_played"
            )
        )
        .where("rounds_played", ">", 2500)
        .join("available_songs", function join() {
            this.on("available_songs.link", "=", "song_guess_count.vlink");
        })
        .orderByRaw("RAND()")
        .limit(100);

    return result.map(
        (x) =>
            `Fun Fact: ${generateSongArtistHyperlink(
                x["song_name"],
                x["artist_name"],
                x["link"]
            )} has a guess rate of ${x["c"]}% over ${
                x["rounds_played"]
            } rounds played`
    );
}

async function bigThreeDominance(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .whereIn("app_kpop_group.name", ["Blackpink", "Twice", "BTS"])
        .orderBy("total_views", "DESC");

    const totalViewsResult = await dbContext
        .kpopVideos("app_kpop")
        .sum("views as total_views");

    const bigThreeViews = result.reduce(
        (prev, current) => prev + current.total_views,
        0
    );

    const proportion = (100 * bigThreeViews) / totalViewsResult[0].total_views;
    return [
        `Fun Fact: BTS, Blackpink and Twice combined account for ${friendlyFormattedNumber(
            bigThreeViews
        )} YouTube views, or ${proportion.toFixed(2)}%!`,
    ];
}

async function fanclubName(): Promise<Array<string>> {
    const result = await dbContext
        .kmq("kpop_groups")
        .select(["name", "fanclub"])
        .where("fanclub", "!=", "")
        .orderByRaw("RAND()")
        .limit(10);

    return result.map(
        (x) => `Fun Fact: ${x["name"]}'s fanclub name is '${x["fanclub"]}'!`
    );
}

async function closeBirthdays(): Promise<Array<string>> {
    const result = await dbContext
        .kmq("kpop_groups")
        .select(
            dbContext.kmq.raw(
                "name, MONTH(date_birth) AS birth_month, DATE_FORMAT(date_birth, '%M %e') as formatted_bday"
            )
        )
        .whereNotNull("date_birth")
        .whereRaw("MONTH(date_birth) = MONTH(CURRENT_DATE())")
        .limit(10);

    return result.map(
        (x) =>
            `Fun Fact: ${x["name"]}'s birthday is this month on ${x["formatted_bday"]}!`
    );
}

async function longestGame(): Promise<string[]> {
    const result = await dbContext
        .kmq("game_sessions")
        .select([
            "rounds_played",
            "session_length",
            "num_participants",
            "avg_guess_time",
        ])
        .orderBy("session_length", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const longestKmqGame = result[0];
    return [
        `KMQ Fact: The world's (current) longest game of KMQ lasted ${friendlyFormattedNumber(
            longestKmqGame.session_length
        )} minutes, with over ${friendlyFormattedNumber(
            longestKmqGame.rounds_played
        )} songs played, an average guess time of ${
            longestKmqGame.avg_guess_time
        } seconds, with ${
            longestKmqGame.num_participants
        } participants! Can you beat that?`,
    ];
}

async function mostGames(): Promise<string[]> {
    const result = await dbContext
        .kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("games_played", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        `KMQ Fact: The most active server has played ${friendlyFormattedNumber(
            mostGamesPlayed.games_played
        )} games of KMQ, with a total of ${friendlyFormattedNumber(
            mostGamesPlayed.songs_guessed
        )} songs guessed!`,
    ];
}

async function mostCorrectGuessed(): Promise<string[]> {
    const result = await dbContext
        .kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("songs_guessed", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        `KMQ Fact: The server with the most correct guesses has played ${friendlyFormattedNumber(
            mostGamesPlayed.games_played
        )} games of KMQ, with a total of ${
            mostGamesPlayed.songs_guessed
        } songs guessed!`,
    ];
}

async function globalTotalGames(): Promise<string[]> {
    const result = await dbContext.kmq("game_sessions").count("* as count");

    if (result.length === 0) return [];
    const totalGamesPlayed = result[0].count as number;
    return [
        `KMQ Fact: A grand total of ${friendlyFormattedNumber(
            totalGamesPlayed
        )} games of KMQ have been played!`,
    ];
}

async function recentGameSessions(): Promise<string[]> {
    const oneWeeksPriorDate = new Date();
    oneWeeksPriorDate.setDate(oneWeeksPriorDate.getDate() - 7);
    const result = await dbContext
        .kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeeksPriorDate);

    if (result.length === 0) return [];
    const recentSessions = result[0].count as number;
    return [
        `KMQ Fact: A total of ${friendlyFormattedNumber(
            recentSessions
        )} games of KMQ have been played in the last week!`,
    ];
}

async function recentGames(): Promise<string[]> {
    const oneWeekPriorDate = new Date();
    oneWeekPriorDate.setDate(oneWeekPriorDate.getDate() - 7);
    const result = await dbContext
        .kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeekPriorDate);

    if (result.length === 0) return [];
    const recentGameCount = result[0].count as number;
    return [
        `KMQ Fact: There has been a total of ${friendlyFormattedNumber(
            recentGameCount
        )} games of KMQ played in the last week, averaging ${Math.round(
            recentGameCount / 7
        )} per day!`,
    ];
}

async function recentUniquePlayers(): Promise<string[]> {
    const intervals = [1, 7, 30];
    const output: Array<string> = [];
    for (const interval of intervals) {
        const priorDate = new Date();
        priorDate.setDate(priorDate.getDate() - interval);
        const result = await dbContext
            .kmq("player_stats")
            .count("* as count")
            .where("last_active", ">", priorDate);

        if (result.length === 0) return [];
        const recentActivePlayers = result[0].count as number;
        output.push(
            `KMQ Fact: ${friendlyFormattedNumber(
                recentActivePlayers
            )} unique players have played KMQ in the past ${pluralize(
                "day",
                interval,
                true
            )}!`
        );
    }

    return output;
}

async function mostSongsGuessedPlayer(): Promise<string[]> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["songs_guessed"])
        .orderBy("songs_guessed", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    return [
        `KMQ Fact: The most active player has guessed ${friendlyFormattedNumber(
            result[0].songs_guessed
        )} songs since Nov 8th, 2020!`,
    ];
}

async function mostGamesPlayedPlayer(): Promise<string[]> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["games_played"])
        .orderBy("games_played", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    return [
        `KMQ Fact: The most active player has played ${friendlyFormattedNumber(
            result[0].games_played
        )} games since Nov 8th, 2020!`,
    ];
}

async function mostGaonFirsts(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_firsts as firsts"])
        .orderBy("firsts", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${
                x["artist_name"]
            } has topped the GAON digital weekly charts the ${getOrdinalNum(
                idx + 1
            )} most times with ${x["firsts"]} first place appearances!`
    );
}

async function mostGaonAppearances(): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_times as appearances"])
        .orderBy("appearances", "DESC")
        .limit(25);

    return result.map(
        (x, idx) =>
            `Fun Fact: ${
                x["artist_name"]
            } has placed on the GAON digital weekly charts the ${getOrdinalNum(
                idx + 1
            )} most times with ${x["appearances"]} appearances!`
    );
}

async function historicalGaonWeekly(): Promise<Array<string>> {
    const startYear = 2010;
    const endYear = new Date().getFullYear() - 1;
    let week = weekOfYear();
    /**
     * Some weeks have 53 days depending on when you start counting a 'week'
     * Better safe than sorry and just call it the 52nd week
     */
    week = week === 53 ? 52 : week;
    const yearRange = Array.from(
        { length: endYear - startYear + 1 },
        (value, key) => startYear + key
    );

    const result = await dbContext
        .kpopVideos("app_kpop_gaondigi")
        .select(["ranklist", "year", "week"])
        .where("week", "=", week)
        .whereIn("year", yearRange)
        .orderBy("year", "DESC");

    const parsedResults = result.map((x) =>
        parseGaonWeeklyRankList(x["ranklist"], x["year"])
    );

    return parsedResults.map(
        (x) =>
            `Fun Fact: On this week in ${
                x[0].year
            }, ${generateSongArtistHyperlink(
                x[0].songName,
                x[0].artistName
            )} was the top charting song on the Gaon Weekly charts!`
    );
}

async function recentGaonWeekly(): Promise<Array<string>> {
    const result = await dbContext
        .kpopVideos("app_kpop_gaondigi")
        .select(["ranklist", "year", "week"])
        .orderBy("year", "DESC")
        .orderBy("week", "DESC")
        .limit(1);

    const parsedResult = parseGaonWeeklyRankList(
        result[0].ranklist,
        result[0].year
    );

    return parsedResult
        .slice(0, 10)
        .map(
            (x, idx) =>
                `Fun Fact: ${generateSongArtistHyperlink(
                    x["songName"],
                    x["artistName"]
                )} is the ${getOrdinalNum(
                    idx + 1
                )} highest charting song on the Gaon Weekly charts last week!`
        );
}

async function topLeveledPlayers(): Promise<Array<string>> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["songs_guessed", "games_played", "level"])
        .orderBy("exp", "DESC")
        .limit(10);

    return result.map(
        (x, idx) =>
            `KMQ Fact: The ${getOrdinalNum(
                idx + 1
            )} highest leveled KMQ player is Level \`${x["level"]}\` with \`${
                x["songs_guessed"]
            }\` songs guessed over \`${x["games_played"]}\` games!`
    );
}

function generateSongArtistHyperlink(
    songName: string,
    artistName: string,
    videoId?: string
): string {
    let url: string;
    if (videoId) {
        url = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
        const searchUrl = new URL("https://youtube.com/results");
        searchUrl.searchParams.append(
            "search_query",
            `${songName} ${artistName}`
        );
        url = searchUrl.toString();
    }

    return `["${songName}" by ${artistName}](${url})`;
}
