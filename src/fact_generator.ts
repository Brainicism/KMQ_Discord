/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-underscore-dangle */
import { URL } from "url";
import dbContext from "./database_context";
import {
    chooseRandom,
    getOrdinalNum,
    weekOfYear,
    friendlyFormattedNumber,
} from "./helpers/utils";
import { DEFAULT_LOCALE, LocaleType } from "./helpers/localization_manager";
import { state } from "./kmq_worker";
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
    const locale: LocaleType = state.locales[guildID] ?? DEFAULT_LOCALE;
    const randomVal = Math.random();
    const factGroup =
        randomVal < 0.85
            ? localeToFactCache[locale].funFacts
            : localeToFactCache[locale].kmqFacts;

    if (factGroup.length === 0) return null;
    return chooseRandom(chooseRandom(factGroup));
}

async function recentMusicVideos(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.newMV" },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["name"],
                    x["artist"],
                    x["youtubeLink"]
                ),
            }
        )
    );
}

async function recentMilestone(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mvViewMilestone" },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                views: friendlyFormattedNumber(x["milestone_views"]),
            }
        )
    );
}

async function recentMusicShowWin(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            {
                locale,
                phrase: "fact.fun.recentMusicShowWin",
            },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["winning_song"],
                    x["artist_name"],
                    x["link"]
                ),
                musicShow: musicShows[x["music_show"]],
                winDate: x["win_date"].toISOString().substring(0, 10),
            }
        )
    );
}

async function musicShowWins(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostMusicShowWins" },
            {
                artist: x["artist_name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                count: x["count"],
            }
        )
    );
}

async function mostViewedGroups(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostViewedGroup" },
            {
                artist: x["artist_name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                views: friendlyFormattedNumber(x["total_views"]),
            }
        )
    );
}

async function mostLikedGroups(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostLikedGroup" },
            {
                artist: x["artist_name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                likes: friendlyFormattedNumber(x["total_likes"]),
            }
        )
    );
}

async function mostViewedVideo(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostViewedVideo" },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                views: friendlyFormattedNumber(x["views"]),
            }
        )
    );
}

async function mostLikedVideo(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostLikedVideo" },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                likes: friendlyFormattedNumber(x["likes"]),
            }
        )
    );
}

async function mostViewedEntertainmentCompany(
    locale: LocaleType
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.companyByArtistViews" },
            {
                name: x["name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                views: friendlyFormattedNumber(x["views"]),
            }
        )
    );
}

async function mostArtistsEntertainmentCompany(
    locale: LocaleType
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.companyByArtistCount" },
            {
                company: x["name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                count: friendlyFormattedNumber(x["count"]),
            }
        )
    );
}

async function mostMusicVideos(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostMVs" },
            {
                artist: x["artist_name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                count: x["count"],
            }
        )
    );
}

async function yearWithMostDebuts(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select("app_kpop_group.formation as formation_year")
        .count("app_kpop_group.id as count")
        .where("formation", "!=", 0)
        .groupBy("app_kpop_group.formation")
        .orderBy("count", "DESC")
        .limit(15);

    return result.map((x, idx) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostDebuts" },
            {
                year: x["formation_year"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                count: x["count"],
            }
        )
    );
}

async function yearWithMostReleases(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostActiveYear" },
            {
                year: String(x["release_year"]),
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                count: String(x["count"]),
            }
        )
    );
}

async function viewsByGender(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.viewsByGender" },
            {
                totalViews: friendlyFormattedNumber(totalViews),
                maleViews: data.male.views,
                maleProportion: data.male.proportion,
                femaleViews: data.female.views,
                femaleProportion: data.female.proportion,
                coedViews: data.coed.views,
                coedProportion: data.coed.proportion,
            }
        ),
    ];
}

async function mostViewedSoloArtist(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostViewedSoloist" },
            {
                artist: x["artist_name"],
                ordinal: state.localizer.internalLocalizer.__({
                    locale,
                    phrase: getOrdinalNum(idx + 1),
                }),
                totalViews: friendlyFormattedNumber(x["total_views"]),
            }
        )
    );
}

async function viewsBySolo(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.viewsByArtistType" },
            {
                totalViews: friendlyFormattedNumber(totalViews),
                groupViews: data.group.views,
                groupProportion: data.group.proportion,
                soloViews: data.solo.views,
                soloProportion: data.solo.proportion,
            }
        ),
    ];
}

async function songReleaseAnniversaries(locale: LocaleType): Promise<string[]> {
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

    return result.map((x) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.oldMV" },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                year: String(x["publish_year"]),
            }
        )
    );
}

async function songGuessRate(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("song_metadata")
        .select(
            dbContext.kmq.raw(
                "song_name, artist_name, ROUND(correct_guesses/rounds_played * 100, 2) as c, link, rounds_played"
            )
        )
        .where("rounds_played", ">", 2500)
        .join("available_songs", function join() {
            this.on("available_songs.link", "=", "song_metadata.vlink");
        })
        .orderByRaw("RAND()")
        .limit(100);

    return result.map((x) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.guessRate" },
            {
                hyperlink: generateSongArtistHyperlink(
                    locale,
                    x["song_name"],
                    x["artist_name"],
                    x["link"]
                ),
                percentage: x["c"],
                roundsPlayed: x["rounds_played"],
            }
        )
    );
}

async function bigThreeDominance(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.bigThreeDominance" },
            {
                bigThreeViews: friendlyFormattedNumber(bigThreeViews),
                proportion: proportion.toFixed(2),
            }
        ),
    ];
}

async function fanclubName(locale: LocaleType): Promise<Array<string>> {
    const result = await dbContext
        .kmq("kpop_groups")
        .select(["name", "fanclub"])
        .where("fanclub", "!=", "")
        .orderByRaw("RAND()")
        .limit(10);

    return result.map((x) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.fanclubName" },
            { name: x["name"], fanclub: x["fanclub"] }
        )
    );
}

async function closeBirthdays(locale: LocaleType): Promise<Array<string>> {
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

    return result.map((x) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.birthday" },
            { name: x["name"], formattedDate: x["formatted_bday"] }
        )
    );
}

async function longestGame(locale: LocaleType): Promise<string[]> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.longestGame" },
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
            }
        ),
    ];
}

async function mostGames(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("games_played", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.mostActiveServer" },
            {
                gamesPlayed: friendlyFormattedNumber(
                    mostGamesPlayed.games_played
                ),
                songsGuessed: friendlyFormattedNumber(
                    mostGamesPlayed.songs_guessed
                ),
            }
        ),
    ];
}

async function mostCorrectGuessed(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("songs_guessed", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.mostCorrectGuessesServer" },
            {
                gamesPlayed: friendlyFormattedNumber(
                    mostGamesPlayed.games_played
                ),
                songsGuessed: friendlyFormattedNumber(
                    mostGamesPlayed.songs_guessed
                ),
            }
        ),
    ];
}

async function globalTotalGames(locale: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq("game_sessions").count("* as count");

    if (result.length === 0) return [];
    const totalGamesPlayed = result[0].count as number;
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.totalGames" },
            { totalGamesPlayed: friendlyFormattedNumber(totalGamesPlayed) }
        ),
    ];
}

async function recentGameSessions(locale: LocaleType): Promise<string[]> {
    const oneWeeksPriorDate = new Date();
    oneWeeksPriorDate.setDate(oneWeeksPriorDate.getDate() - 7);
    const result = await dbContext
        .kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeeksPriorDate);

    if (result.length === 0) return [];
    const recentSessions = result[0].count as number;
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.recentSessions" },
            { recentSessions: friendlyFormattedNumber(recentSessions) }
        ),
    ];
}

async function recentGames(locale: LocaleType): Promise<string[]> {
    const oneWeekPriorDate = new Date();
    oneWeekPriorDate.setDate(oneWeekPriorDate.getDate() - 7);
    const result = await dbContext
        .kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeekPriorDate);

    if (result.length === 0) return [];
    const recentGameCount = result[0].count as number;
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.recentGameCount" },
            { recentGameCount: friendlyFormattedNumber(recentGameCount) }
        ),
    ];
}

async function recentUniquePlayers(locale: LocaleType): Promise<string[]> {
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
            state.localizer.internalLocalizer.__(
                { locale, phrase: "fact.kmq.uniquePlayers" },
                {
                    recentActivePlayers:
                        friendlyFormattedNumber(recentActivePlayers),
                    xDays: state.localizer.internalLocalizer.__n({
                        singular: "%s day",
                        plural: "%s days",
                        count: interval,
                        locale,
                    }),
                }
            )
        );
    }

    return output;
}

async function mostSongsGuessedPlayer(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["songs_guessed"])
        .orderBy("songs_guessed", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.mostActivePlayerSongsGuessed" },
            { songsGuessed: friendlyFormattedNumber(result[0].songs_guessed) }
        ),
    ];
}

async function mostGamesPlayedPlayer(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["games_played"])
        .orderBy("games_played", "DESC")
        .limit(1);

    if (result.length === 0) return [];
    return [
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.mostActivePlayerGamesPlayed" },
            { gamesPlayed: friendlyFormattedNumber(result[0].games_played) }
        ),
    ];
}

async function mostGaonFirsts(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_firsts as firsts"])
        .orderBy("firsts", "DESC")
        .limit(25);

    return result.map((x, idx) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostGaonFirsts" },
            {
                artistName: x["artist_name"],
                ordinalNum: getOrdinalNum(idx + 1),
                firstPlaceCount: x["firsts"],
            }
        )
    );
}

async function mostGaonAppearances(locale: LocaleType): Promise<string[]> {
    const result = await dbContext
        .kpopVideos("app_kpop_group")
        .select(["name as artist_name", "gaondigital_times as appearances"])
        .orderBy("appearances", "DESC")
        .limit(25);

    return result.map((x, idx) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.mostGaonAppearances" },
            {
                artistName: x["artist_name"],
                ordinalNum: getOrdinalNum(idx + 1),
                appearances: x["appearances"],
            }
        )
    );
}

async function historicalGaonWeekly(
    locale: LocaleType
): Promise<Array<string>> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.historicalGaonWeekly" },
            {
                year: x[0].year,
                songName: generateSongArtistHyperlink(
                    locale,
                    x[0].songName,
                    x[0].artistName
                ),
            }
        )
    );
}

async function recentGaonWeekly(locale: LocaleType): Promise<Array<string>> {
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
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.fun.recentGaonWeekly" },
            {
                songName: generateSongArtistHyperlink(
                    locale,
                    x["songName"],
                    x["artistName"]
                ),
                ordinalNum: getOrdinalNum(idx + 1),
            }
        )
    );
}

async function topLeveledPlayers(locale: LocaleType): Promise<Array<string>> {
    const result = await dbContext
        .kmq("player_stats")
        .select(["songs_guessed", "games_played", "level"])
        .orderBy("exp", "DESC")
        .limit(10);

    return result.map((x, idx) =>
        state.localizer.internalLocalizer.__(
            { locale, phrase: "fact.kmq.highestLeveledPlayerStats" },
            {
                ordinalNum: getOrdinalNum(idx + 1),
                level: `\`${x["level"]}\``,
                songsGuessed: `\`${friendlyFormattedNumber(
                    x["songs_guessed"]
                )}\``,
                gamesPlayed: `\`${friendlyFormattedNumber(
                    x["games_played"]
                )}\``,
            }
        )
    );
}

function generateSongArtistHyperlink(
    locale: LocaleType,
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

    return state.localizer.internalLocalizer.__(
        { locale, phrase: "fact.fun.hyperlinkGenerator" },
        { songName, artistName, url }
    );
}
