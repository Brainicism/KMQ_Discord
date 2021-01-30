/* eslint-disable @typescript-eslint/no-use-before-define */
import PHPUnserialize from "php-unserialize";
import { URL } from "url";
import dbContext from "./database_context";
import { chooseRandom, weekOfYear } from "./helpers/utils";
import _logger from "./logger";

const logger = _logger("fact_generator");

const musicShows = {
    inkigayo: "Inkigayo",
    countdown: "Countdown",
    theshow: "The Show",
    musiccore: "Show! Music Core",
    musicbank: "Music Bank",
    showchampion: "Show Champion",
};
const funFactFunctions = [recentMusicVideos, recentMilestone, recentMusicShowWin, musicShowWins, mostViewedGroups, mostLikedGroups, mostViewedVideo, mostLikedVideo,
    mostMusicVideos, yearWithMostDebuts, yearWithMostReleases, viewsByGender, mostViewedSoloArtist, viewsBySolo, bigThreeDominance, mostGaonFirsts,
    mostGaonAppearances, historicalGaonWeekly, recentGaonWeekly];

const kmqFactFunctions = [longestGame, mostGames, mostCorrectGuessed, globalTotalGames, recentGameSessions, recentGames, mostSongsGuessedPlayer,
    mostGamesPlayedPlayer, recentUniquePlayers, topLeveledPlayers];

function getOrdinalNum(n: number): string {
    return n + (n > 0 ? ["th", "st", "nd", "rd"][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : "");
}

let factCache: {
    funFacts: string[][],
    kmqFacts: string[][],
    lastUpdated: number
} = null;

interface GaonWeeklyEntry {
    songName: string;
    artistName: string;
    artistId?: string;
    songId?: string;
    year: string;
}

export async function reloadFactCache() {
    logger.info("Regenerating fact cache...");
    await generateFacts();
}

async function generateFacts() {
    const funFactPromises = funFactFunctions.map((x) => x());
    const kmqFactPromises = kmqFactFunctions.map((x) => x());
    const funFacts = await Promise.all(funFactPromises);
    const kmqFacts = await Promise.all(kmqFactPromises);
    factCache = {
        funFacts,
        kmqFacts,
        lastUpdated: Date.now(),
    };
}

function parseGaonWeeklyRankList(ranklist: string, year: string): Array<GaonWeeklyEntry> {
    const parsedWeeklyRankList = PHPUnserialize.unserialize(ranklist);
    return Object.values(parsedWeeklyRankList).map((x) => {
        const songName = x["0"];
        const artistName = x["1"];
        const artistId = x["2"] || null;
        const songId = x["3"] || null;
        return {
            songName,
            artistName,
            artistId,
            songId,
            year,
        };
    });
}

export function getFact(): string {
    const randomVal = Math.random();
    if (randomVal < 0.85) {
        const { funFacts } = factCache;
        const funFactGroup = chooseRandom(funFacts);
        return chooseRandom(funFactGroup);
    }

    const { kmqFacts } = factCache;
    const kmqFactGroup = chooseRandom(kmqFacts);
    return chooseRandom(kmqFactGroup);
}

async function recentMusicVideos(): Promise<string[]> {
    const oneMonthPriorDate = new Date();
    oneMonthPriorDate.setMonth(oneMonthPriorDate.getMonth() - 1);
    const result = await dbContext.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink", "publishedon"])
        .join("kpop_videos.app_kpop_group", function join() {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id");
        })
        .where("dead", "n")
        .andWhere("vtype", "main")
        .andWhere("publishedon", ">", oneMonthPriorDate)
        .orderBy("kpop_videos.app_kpop.publishedon", "DESC");
    if (result.length === 0) {
        logger.warn("recentMusicVideos generated no facts");
        return [];
    }
    return result.map((x) => `New Song Alert: Check out this recently released music video, ['${x.name}' by '${x.artist}'](https://youtu.be/${x.youtubeLink})`);
}

async function recentMilestone(): Promise<string[]> {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 14);
    const result = await dbContext.kpopVideos("app_kpop_miles")
        .select(["app_kpop_miles.mvalue as milestone_views", "app_kpop_miles.data as milestone_data", "app_kpop.nome as song_name", "app_kpop_group.name as artist_name"])
        .where("data", ">", twoWeeksPriorDate)
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
    return result.map((x) => `Fun Fact: ${generateSongArtistHyperlink(x.song_name, x.artist_name)} recently reached ${x.milestone_views.toLocaleString()} views on YouTube!`);
}

async function recentMusicShowWin(): Promise<string[]> {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 7);
    const result = await dbContext.kpopVideos("app_kpop_ms")
        .select(["app_kpop_ms.musicshow as music_show", "app_kpop_ms.data as win_date", "app_kpop_group.name as artist_name"])
        .where("data", ">", twoWeeksPriorDate)
        .join("app_kpop_group", function join() {
            this.on("app_kpop_ms.id_artist", "=", "app_kpop_group.id");
        });
    if (result.length === 0) {
        logger.warn("recentMusicShowWin generated no facts");
        return [];
    }
    return result.map((x) => `Fun Fact: '${x.artist_name}' recently won on ${musicShows[x.music_show]} on ${x.win_date.toISOString().substring(0, 10)}!`);
}

async function musicShowWins(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop_ms")
        .select(["app_kpop_group.name as artist_name"])
        .count("app_kpop_ms.id_artist as count")
        .groupBy("app_kpop_ms.id_artist")
        .having("count", ">=", 5)
        .join("app_kpop_group", function join() {
            this.on("app_kpop_ms.id_artist", "=", "app_kpop_group.id");
        })
        .orderBy("count", "DESC")
        .limit(25);
    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' has won the ${getOrdinalNum(idx + 1)} most music show with ${x.count} wins!`);
}

async function mostViewedGroups(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop_group.issolo", "=", "n")
        .orderBy("total_views", "DESC")
        .limit(25);

    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' is the ${getOrdinalNum(idx + 1)} most viewed group with ${x.total_views.toLocaleString()} total YouTube views!`);
}

async function mostLikedGroups(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.likes as total_likes")
        .groupBy("app_kpop.id_artist")
        .limit(25)
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop_group.issolo", "=", "n")
        .orderBy("total_likes", "DESC");
    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' is the ${getOrdinalNum(idx + 1)} most liked group with ${x.total_likes.toLocaleString()} total YouTube likes!`);
}

async function mostViewedVideo(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name", "app_kpop.nome as song_name", "app_kpop.views as views"])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop.vtype", "main")
        .orderBy("views", "DESC")
        .limit(25);
    return result.map((x, idx) => `Fun Fact: ${generateSongArtistHyperlink(x.song_name, x.artist_name)} is the ${getOrdinalNum(idx + 1)} most viewed music video with ${x.views.toLocaleString()} YouTube views!`);
}

async function mostLikedVideo(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name", "app_kpop.nome as song_name", "app_kpop.likes as likes"])
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .orderBy("likes", "DESC")
        .limit(25);
    return result.map((x, idx) => `Fun Fact: ${generateSongArtistHyperlink(x.song_name, x.artist_name)} is the ${getOrdinalNum(idx + 1)} most liked music video with ${x.likes.toLocaleString()} YouTube likes!`);
}

async function mostMusicVideos(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .where("vtype", "=", "main")
        .count("app_kpop.id_artist as count")
        .groupBy("id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .orderBy("count", "DESC")
        .limit(25);

    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' has the ${getOrdinalNum(idx + 1)} most music videos with ${x.count} on YouTube!`);
}

async function yearWithMostDebuts(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop_group")
        .select("app_kpop_group.formation as formation_year")
        .count("app_kpop_group.id as count")
        .where("formation", "!=", 0)
        .groupBy("app_kpop_group.formation")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map((x, idx) => `Fun Fact: ${x.formation_year} had the ${getOrdinalNum(idx + 1)} most debuts with ${x.count} groups debuting!`);
}

async function yearWithMostReleases(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(dbContext.kpopVideos.raw("YEAR(app_kpop.publishedon) as release_year"))
        .count("* as count")
        .where("app_kpop.vtype", "=", "main")
        .groupBy("release_year")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map((x, idx) => `Fun Fact: ${x.release_year} was the ${getOrdinalNum(idx + 1)} most active year in K-Pop with ${x.count} music video releases!`);
}

async function viewsByGender(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
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
            views: genderViews.views.toLocaleString(),
            proportion: ((100 * genderViews.views) / totalViews).toFixed(2),
        };
    }
    return [`Fun Fact: There is a combined total of ${totalViews.toLocaleString()} views on all K-Pop music videos on YouTube. ${data.male.views} (${data.male.proportion}%) of which are from male, ${data.female.views} (${data.female.proportion}%) from female, and the remaining ${data.coed.views} (${data.coed.proportion}%) from co-ed groups!`];
}

async function mostViewedSoloArtist(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .where("app_kpop_group.issolo", "=", "y")
        .orderBy("total_views", "DESC")
        .limit(25);
    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' is the ${getOrdinalNum(idx + 1)} most viewed solo artist with ${x.total_views.toLocaleString()} total YouTube views!`);
}

async function viewsBySolo(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
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
            views: result[0].views.toLocaleString(),
            proportion: ((100 * result[0].views) / totalViews).toFixed(2),
        },
        solo: {
            views: result[1].views.toLocaleString(),
            proportion: ((100 * result[1].views) / totalViews).toFixed(2),
        },
    };
    return [`Fun Fact: There is a combined total of ${totalViews.toLocaleString()} views on all K-Pop music videos on YouTube. ${data.group.views} (${data.group.proportion}%) of which are groups, while ${data.solo.views} (${data.solo.proportion}%) are from solo artists!`];
}

async function bigThreeDominance(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function join() {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id");
        })
        .whereIn("app_kpop_group.name", ["Blackpink", "Twice", "BTS"])
        .orderBy("total_views", "DESC");

    const totalViewsResult = await dbContext.kpopVideos("app_kpop")
        .sum("views as total_views");
    const bigThreeViews = result.reduce((prev, current) => prev + current.total_views, 0);
    const proportion = (100 * bigThreeViews) / totalViewsResult[0].total_views;
    return [`Fun Fact: BTS, Blackpink and Twice combined account for ${bigThreeViews.toLocaleString()} YouTube views, or ${proportion.toFixed(2)}%!`];
}

async function longestGame(): Promise<string[]> {
    const result = await dbContext.kmq("game_sessions")
        .select(["rounds_played", "session_length", "num_participants", "avg_guess_time"])
        .orderBy("session_length", "DESC");
    const longestKmqGame = result[0];
    return [`KMQ Fact: The world's (current) longest game of KMQ lasted ${longestKmqGame.session_length} minutes, with over ${longestKmqGame.rounds_played} songs played, an average guess time of ${longestKmqGame.avg_guess_time} seconds, with ${longestKmqGame.num_participants} participants! Can you beat that?`];
}

async function mostGames(): Promise<string[]> {
    const result = await dbContext.kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("games_played", "DESC");
    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [`KMQ Fact: The most active server has played ${mostGamesPlayed.games_played} games of KMQ, with a total of ${mostGamesPlayed.songs_guessed} songs guessed!`];
}

async function mostCorrectGuessed(): Promise<string[]> {
    const result = await dbContext.kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("songs_guessed", "DESC");
    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [`KMQ Fact: The server with the most correct guesses has played ${mostGamesPlayed.games_played} games of KMQ, with a total of ${mostGamesPlayed.songs_guessed} songs guessed!`];
}

async function globalTotalGames(): Promise<string[]> {
    const result = await dbContext.kmq("game_sessions")
        .count("* as count");
    if (result.length === 0) return [];
    const totalGamesPlayed = result[0].count;
    return [`KMQ Fact: A grand total of ${totalGamesPlayed} games of KMQ have been played!`];
}

async function recentGameSessions(): Promise<string[]> {
    const oneWeeksPriorDate = new Date();
    oneWeeksPriorDate.setDate(oneWeeksPriorDate.getDate() - 7);
    const result = await dbContext.kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeeksPriorDate);
    if (result.length === 0) return [];
    const recentSessions = result[0].count;
    return [`KMQ Fact: A total of ${recentSessions} games of KMQ have been played in the last week!`];
}

async function recentGames(): Promise<string[]> {
    const oneWeekPriorDate = new Date();
    oneWeekPriorDate.setDate(oneWeekPriorDate.getDate() - 7);
    const result = await dbContext.kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeekPriorDate);
    if (result.length === 0) return [];
    const recentGameCount = result[0].count as number;
    return [`KMQ Fact: There has been a total of ${recentGameCount} games of KMQ played in the last week, averaging ${Math.round(recentGameCount / 7)} per day!`];
}

async function recentUniquePlayers(): Promise<string[]> {
    const intervals = [1, 7, 30];
    const output: Array<string> = [];
    for (const interval of intervals) {
        const priorDate = new Date();
        priorDate.setDate(priorDate.getDate() - interval);
        const result = await dbContext.kmq("player_stats")
            .count("* as count")
            .where("last_active", ">", priorDate);
        if (result.length === 0) return [];
        const recentActivePlayers = result[0].count as number;
        output.push(`KMQ Fact: ${recentActivePlayers} unique players have played KMQ in the past ${interval} day(s)!`);
    }

    return output;
}

async function mostSongsGuessedPlayer(): Promise<string[]> {
    const result = await dbContext.kmq("player_stats")
        .select(["songs_guessed"])
        .orderBy("songs_guessed", "DESC")
        .limit(1);
    if (result.length === 0) return [];
    return [`KMQ Fact: The most active player has guessed ${result[0].songs_guessed} songs since Nov 8th, 2020!`];
}

async function mostGamesPlayedPlayer(): Promise<string[]> {
    const result = await dbContext.kmq("player_stats")
        .select(["games_played"])
        .orderBy("games_played", "DESC")
        .limit(1);
    if (result.length === 0) return [];
    return [`KMQ Fact: The most active player has played ${result[0].games_played} games since Nov 8th, 2020!`];
}

async function mostGaonFirsts(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_firsts as firsts"])
        .orderBy("firsts", "DESC")
        .limit(25);
    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' has topped the GAON digital weekly charts the ${getOrdinalNum(idx + 1)} most times with ${x.firsts} first place appearances!`);
}

async function mostGaonAppearances(): Promise<string[]> {
    const result = await dbContext.kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_times as appearances"])
        .orderBy("appearances", "DESC")
        .limit(25);
    return result.map((x, idx) => `Fun Fact: '${x.artist_name}' has placed on the GAON digital weekly charts the ${getOrdinalNum(idx + 1)} most times with ${x.appearances} appearances!`);
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
    const yearRange = Array.from({ length: endYear - startYear + 1 }, (value, key) => startYear + key);
    const result = await dbContext.kpopVideos("app_kpop_gaondigi")
        .select(["ranklist", "year", "week"])
        .where("week", "=", week)
        .whereIn("year", yearRange)
        .orderBy("year", "DESC");
    const parsedResults = result.map((x) => parseGaonWeeklyRankList(x.ranklist, x.year));
    return parsedResults.map((x) => `Fun Fact: On this week in ${x[0].year}, ${generateSongArtistHyperlink(x[0].songName, x[0].artistName)} was the topping charting song on the Gaon Weekly charts!`);
}

async function recentGaonWeekly(): Promise<Array<string>> {
    const result = await dbContext.kpopVideos("app_kpop_gaondigi")
        .select(["ranklist", "year", "week"])
        .orderBy("year", "DESC")
        .orderBy("week", "DESC")
        .limit(1);
    const parsedResult = parseGaonWeeklyRankList(result[0].ranklist, result[0].year);
    return parsedResult.slice(0, 10).map((x, idx) => `Fun Fact: ${generateSongArtistHyperlink(x.songName, x.artistName)} is the ${getOrdinalNum(idx + 1)} highest charting song on the Gaon Weekly charts last week!`);
}

async function topLeveledPlayers(): Promise<Array<string>> {
    const result = await dbContext.kmq("player_stats")
        .select(["songs_guessed", "games_played", "level"])
        .orderBy("exp", "DESC")
        .limit(10);
    return result.map((x, idx) => `KMQ Fact: The ${getOrdinalNum(idx + 1)} highest leveled KMQ player is Level \`${x.level}\` with \`${x.songs_guessed}\` songs guessed over \`${x.games_played}\` games!`);
}

function generateSongArtistHyperlink(songName: string, artistName: string): string {
    const searchUrl = new URL("https://youtube.com/results");
    searchUrl.searchParams.append("search_query", `${songName} ${artistName}`);
    return `['${songName}' by '${artistName}'](${searchUrl.toString()})`;
}
