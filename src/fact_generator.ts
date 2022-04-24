/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-underscore-dangle */
import { IPCLogger } from "./logger";
import { URL } from "url";
import {
    chooseRandom,
    friendlyFormattedNumber,
    getOrdinalNum,
    weekOfYear,
} from "./helpers/utils";
import LocaleType from "./enums/locale_type";
import LocalizationManager from "./helpers/localization_manager";
import State from "./state";
import dbContext from "./database_context";

const logger = new IPCLogger("fact_generator");

const musicShows = {
    inkigayo: "Inkigayo",
    countdown: "Countdown",
    theshow: "The Show",
    musiccore: "Show! Music Core",
    musicbank: "Music Bank",
    showchampion: "Show Champion",
};

const funFactFunctions: Array<(locale: LocaleType) => Promise<string[]>> = [
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
    mostAnnualAwardShowWins,
];

const kmqFactFunctions: Array<(locale: LocaleType) => Promise<string[]>> = [
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

interface FactCache {
    funFacts: string[][];
    kmqFacts: string[][];
    lastUpdated: number;
}

const localeToFactCache: { [locale: string]: FactCache } = {};

for (const locale of Object.values(LocaleType)) {
    localeToFactCache[locale] = {
        funFacts: [],
        kmqFacts: [],
        lastUpdated: null,
    };
}

interface GaonWeeklyEntry {
    songName: string;
    artistName: string;
    artistID?: string;
    songID?: string;
    year: string;
}

/**
 * Reloads the fact fcache
 */
export async function reloadFactCache(): Promise<void> {
    logger.info("Regenerating fact cache...");
    for (const locale of Object.values(LocaleType)) {
        await generateFacts(locale);
    }
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

async function generateFacts(locale: LocaleType): Promise<void> {
    const funFactPromises = funFactFunctions.map((x) => x(locale));
    const kmqFactPromises = kmqFactFunctions.map((x) => x(locale));
    const funFacts = await resolveFactPromises(funFactPromises);
    const kmqFacts = await resolveFactPromises(kmqFactPromises);
    localeToFactCache[locale] = {
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

/**
 * @param guildID - The guild ID
 * @returns a random cached fact
 */
export function getFact(guildID: string): string {
    const locale: LocaleType = State.getGuildLocale(guildID);
    const randomVal = Math.random();
    const factGroup =
        randomVal < 0.85
            ? localeToFactCache[locale].funFacts
            : localeToFactCache[locale].kmqFacts;

    if (factGroup.length === 0) return null;
    return chooseRandom(chooseRandom(factGroup));
}

async function recentMusicVideos(lng: LocaleType): Promise<string[]> {
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

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t("fact.fun.newMV", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["name"],
                x["artist"],
                x["youtubeLink"]
            ),
            lng,
        })
    );
}

async function recentMilestone(lng: LocaleType): Promise<string[]> {
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

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mvViewMilestone",
            {
                hyperlink: generateSongArtistHyperlink(
                    lng,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                views: friendlyFormattedNumber(x["milestone_views"]),
                lng,
            }
        )
    );
}

async function recentMusicShowWin(lng: LocaleType): Promise<string[]> {
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

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.recentMusicShowWin",
            {
                hyperlink: generateSongArtistHyperlink(
                    lng,
                    x["winning_song"],
                    x["artist_name"],
                    x["link"]
                ),
                musicShow: musicShows[x["music_show"]],
                winDate: x["win_date"].toISOString().substring(0, 10),
                lng,
            }
        )
    );
}

async function musicShowWins(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostMusicShowWins",
            {
                artist: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                num: x["count"],
                lng,
            }
        )
    );
}

async function mostViewedGroups(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostViewedGroup",
            {
                artist: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                views: friendlyFormattedNumber(x["total_views"]),
                lng,
            }
        )
    );
}

async function mostLikedGroups(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostLikedGroup",
            {
                artist: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                likes: friendlyFormattedNumber(x["total_likes"]),
                lng,
            }
        )
    );
}

async function mostViewedVideo(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostViewedVideo",
            {
                hyperlink: generateSongArtistHyperlink(
                    lng,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                views: friendlyFormattedNumber(x["views"]),
                lng,
            }
        )
    );
}

async function mostLikedVideo(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostLikedVideo",
            {
                hyperlink: generateSongArtistHyperlink(
                    lng,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                likes: friendlyFormattedNumber(x["likes"]),
                lng,
            }
        )
    );
}

async function mostViewedEntertainmentCompany(
    lng: LocaleType
): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.companyByArtistViews",
            {
                name: x["name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                views: friendlyFormattedNumber(x["views"]),
                lng,
            }
        )
    );
}

async function mostArtistsEntertainmentCompany(
    lng: LocaleType
): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.companyByArtistCount",
            {
                company: x["name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                num: friendlyFormattedNumber(x["count"]),
                lng,
            }
        )
    );
}

async function mostMusicVideos(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t("fact.fun.mostMVs", {
            artist: x["artist_name"],
            ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                getOrdinalNum(idx + 1),
                { lng }
            ),
            num: x["count"],
            lng,
        })
    );
}

async function yearWithMostDebuts(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select("app_kpop_group.formation as formation_year")
        .count("app_kpop_group.id as count")
        .where("formation", "!=", 0)
        .groupBy("app_kpop_group.formation")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostDebuts",
            {
                year: x["formation_year"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                num: x["count"],
                lng,
            }
        )
    );
}

async function yearWithMostReleases(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostActiveYear",
            {
                year: String(x["release_year"]),
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                num: String(x["count"]),
                lng,
            }
        )
    );
}

async function viewsByGender(lng: LocaleType): Promise<string[]> {
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
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.viewsByGender",
            {
                totalViews: friendlyFormattedNumber(totalViews),
                maleViews: data.male.views,
                maleProportion: data.male.proportion,
                femaleViews: data.female.views,
                femaleProportion: data.female.proportion,
                coedViews: data.coed.views,
                coedProportion: data.coed.proportion,
                lng,
            }
        ),
    ];
}

async function mostViewedSoloArtist(lng: LocaleType): Promise<string[]> {
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

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostViewedSoloist",
            {
                artist: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                views: friendlyFormattedNumber(x["total_views"]),
                lng,
            }
        )
    );
}

async function viewsBySolo(lng: LocaleType): Promise<string[]> {
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
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.viewsByArtistType",
            {
                totalViews: friendlyFormattedNumber(totalViews),
                groupViews: data.group.views,
                groupProportion: data.group.proportion,
                soloViews: data.solo.views,
                soloProportion: data.solo.proportion,
                lng,
            }
        ),
    ];
}

async function songReleaseAnniversaries(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("available_songs")
        .select(
            dbContext.kmq.raw(
                "song_name_en, artist_name_en, YEAR(publishedon) as publish_year, link"
            )
        )
        .whereRaw("WEEK(publishedon) = WEEK(NOW())")
        .andWhereRaw("YEAR(publishedon) != YEAR(NOW())")
        .orderBy("views", "DESC")
        .limit(25);

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t("fact.fun.oldMV", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["song_name_en"],
                x["artist_name_en"],
                x["link"]
            ),
            year: String(x["publish_year"]),
            lng,
        })
    );
}

async function songGuessRate(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("song_metadata")
        .select(
            dbContext.kmq.raw(
                "song_name_en, artist_name_en, ROUND(correct_guesses/rounds_played * 100, 2) AS c, link, rounds_played"
            )
        )
        .where("rounds_played", ">", 2500)
        .join("available_songs", function join() {
            this.on("available_songs.link", "=", "song_metadata.vlink");
        })
        .orderByRaw("RAND()")
        .limit(100);

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.guessRate",
            {
                hyperlink: generateSongArtistHyperlink(
                    lng,
                    x["song_name_en"],
                    x["artist_name_en"],
                    x["link"]
                ),
                percentage: x["c"],
                roundsPlayed: x["rounds_played"],
                lng,
            }
        )
    );
}

async function bigThreeDominance(lng: LocaleType): Promise<string[]> {
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
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.bigThreeDominance",
            {
                bigThreeViews: friendlyFormattedNumber(bigThreeViews),
                proportion: proportion.toFixed(2),
                lng,
            }
        ),
    ];
}

async function fanclubName(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name", "fanclub"])
        .where("fanclub", "!=", "")
        .orderByRaw("RAND()")
        .limit(10);

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.fanclubName",
            {
                name: x["name"],
                fanclub: x["fanclub"],
                lng,
            }
        )
    );
}

async function closeBirthdays(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(
            dbContext.kmq.raw(
                "name, MONTH(date_birth) AS birth_month, DATE_FORMAT(date_birth, '%M %e') as formatted_bday"
            )
        )
        .whereNotNull("date_birth")
        .whereRaw("MONTH(date_birth) = MONTH(CURRENT_DATE())")
        .limit(10);

    return result.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t("fact.fun.birthday", {
            name: x["name"],
            formattedDate: x["formatted_bday"],
            lng,
        })
    );
}

async function longestGame(lng: LocaleType): Promise<string[]> {
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
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.longestGame",
            {
                sessionLength: friendlyFormattedNumber(
                    longestKmqGame.session_length
                ),
                roundsPlayed: friendlyFormattedNumber(
                    longestKmqGame.rounds_played
                ),
                avgGuessTime: friendlyFormattedNumber(
                    longestKmqGame.avg_guess_time
                ),
                numParticipants: friendlyFormattedNumber(
                    longestKmqGame.num_participants
                ),
                lng,
            }
        ),
    ];
}

async function mostGames(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("guilds")
        .select("games_played", "songs_guessed")
        .orderBy("games_played", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.mostActiveServer",
            {
                gamesPlayed: friendlyFormattedNumber(
                    mostGamesPlayed.games_played
                ),
                songsGuessed: friendlyFormattedNumber(
                    mostGamesPlayed.songs_guessed
                ),
                lng,
            }
        ),
    ];
}

async function mostCorrectGuessed(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("guilds")
        .select("games_played", "songs_guessed")
        .orderBy("songs_guessed", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.mostCorrectGuessesServer",
            {
                gamesPlayed: friendlyFormattedNumber(
                    mostGamesPlayed.games_played
                ),
                songsGuessed: friendlyFormattedNumber(
                    mostGamesPlayed.songs_guessed
                ),
                lng,
            }
        ),
    ];
}

async function globalTotalGames(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq("game_sessions").count("* as count");

    if (result.length === 0) return [];
    const totalGamesPlayed = result[0].count as number;
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.totalGames",
            {
                totalGamesPlayed: friendlyFormattedNumber(totalGamesPlayed),
                lng,
            }
        ),
    ];
}

async function recentGameSessions(lng: LocaleType): Promise<string[]> {
    const oneWeeksPriorDate = new Date();
    oneWeeksPriorDate.setDate(oneWeeksPriorDate.getDate() - 7);
    const result = await dbContext
        .kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeeksPriorDate);

    if (result.length === 0) return [];
    const recentSessions = result[0].count as number;
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.recentSessions",
            {
                recentSessions: friendlyFormattedNumber(recentSessions),
                lng,
            }
        ),
    ];
}

async function recentGames(lng: LocaleType): Promise<string[]> {
    const oneWeekPriorDate = new Date();
    oneWeekPriorDate.setDate(oneWeekPriorDate.getDate() - 7);
    const result = await dbContext
        .kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeekPriorDate);

    if (result.length === 0) return [];
    const recentGameCount = result[0].count as number;
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.recentGameCount",
            {
                recentGameCount: friendlyFormattedNumber(recentGameCount),
                lng,
            }
        ),
    ];
}

async function recentUniquePlayers(lng: LocaleType): Promise<string[]> {
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
            LocalizationManager.localizer.internalLocalizer.t(
                "fact.kmq.uniquePlayers",
                {
                    recentActivePlayers:
                        friendlyFormattedNumber(recentActivePlayers),
                    xDays: LocalizationManager.localizer.internalLocalizer.t(
                        "misc.plural.day",
                        {
                            count: interval,
                            lng,
                        }
                    ),
                    lng,
                }
            )
        );
    }

    return output;
}

async function mostSongsGuessedPlayer(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["songs_guessed"])
        .orderBy("songs_guessed", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.mostActivePlayerSongsGuessed",
            {
                songsGuessed: friendlyFormattedNumber(result[0].songs_guessed),
                lng,
            }
        ),
    ];
}

async function mostGamesPlayedPlayer(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["games_played"])
        .orderBy("games_played", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    return [
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.mostActivePlayerGamesPlayed",
            {
                gamesPlayed: friendlyFormattedNumber(result[0].games_played),
                lng,
            }
        ),
    ];
}

async function mostGaonFirsts(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_firsts as firsts"])
        .orderBy("firsts", "DESC")
        .limit(25);

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostGaonFirsts",
            {
                artistName: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                firstPlaceCount: x["firsts"],
                lng,
            }
        )
    );
}

async function mostGaonAppearances(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_times as appearances"])
        .orderBy("appearances", "DESC")
        .limit(25);

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostGaonAppearances",
            {
                artistName: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                appearances: x["appearances"],
                lng,
            }
        )
    );
}

async function mostAnnualAwardShowWins(lng: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "yawards_total as wins"])
        .orderBy("wins", "DESC")
        .limit(25);

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.mostAnnualAwardShowWins",
            {
                artistName: x["artist_name"],
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                wins: x["wins"],
                lng,
            }
        )
    );
}

async function historicalGaonWeekly(lng: LocaleType): Promise<Array<string>> {
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

    return parsedResults.map((x) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.historicalGaonWeekly",
            {
                year: x[0].year,
                songName: generateSongArtistHyperlink(
                    lng,
                    x[0].songName,
                    x[0].artistName
                ),
                lng,
            }
        )
    );
}

async function recentGaonWeekly(lng: LocaleType): Promise<Array<string>> {
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

    return parsedResult.slice(0, 10).map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.fun.recentGaonWeekly",
            {
                songName: generateSongArtistHyperlink(
                    lng,
                    x["songName"],
                    x["artistName"]
                ),
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                lng,
            }
        )
    );
}

async function topLeveledPlayers(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["songs_guessed", "games_played", "level"])
        .orderBy("exp", "DESC")
        .limit(10);

    return result.map((x, idx) =>
        LocalizationManager.localizer.internalLocalizer.t(
            "fact.kmq.highestLeveledPlayerStats",
            {
                ordinalNum: LocalizationManager.localizer.internalLocalizer.t(
                    getOrdinalNum(idx + 1),
                    { lng }
                ),
                level: `\`${x["level"]}\``,
                songsGuessed: `\`${friendlyFormattedNumber(
                    x["songs_guessed"]
                )}\``,
                gamesPlayed: `\`${friendlyFormattedNumber(
                    x["games_played"]
                )}\``,
                lng,
            }
        )
    );
}

function generateSongArtistHyperlink(
    lng: LocaleType,
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

    return LocalizationManager.localizer.internalLocalizer.t(
        "fact.fun.hyperlinkGenerator",
        {
            songName,
            artistName,
            url,
            lng,
        }
    );
}
