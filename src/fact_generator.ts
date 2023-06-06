/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-underscore-dangle */
import { IPCLogger } from "./logger";
import { URL } from "url";
import {
    chooseRandom,
    discordDateFormat,
    friendlyFormattedNumber,
    getOrdinalNum,
    italicize,
    weekOfYear,
} from "./helpers/utils";
import { sql } from "kysely";
import LocaleType from "./enums/locale_type";
import State from "./state";
import dbContext from "./database_context";
import i18n from "./helpers/localization_manager";

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
    latestPak,
    upcomingReleases,
];

const kmqFactFunctions: Array<(locale: LocaleType) => Promise<string[]>> = [
    longestGame,
    mostGames,
    mostCorrectGuessed,
    globalTotalGames,
    recentGameSessions,
    recentGameRounds,
    mostSongsGuessedPlayer,
    mostGamesPlayedPlayer,
    recentUniquePlayers,
    topLeveledPlayers,
    songGuessRate,
];

interface FactCache {
    funFacts: string[][];
    kmqFacts: string[][];
    lastUpdated: number | null;
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
 * Reloads the fact cache
 */
export async function reloadFactCache(): Promise<void> {
    logger.info("Regenerating fact cache...");
    await Promise.allSettled(
        Object.values(LocaleType).map(async (locale) => {
            await generateFacts(locale);
        })
    );
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
    year: number
): Array<GaonWeeklyEntry> {
    return JSON.parse(ranklist).map((x: string[]) => {
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
export function getFact(guildID: string): string | null {
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
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop_group.id", "app_kpop.id_artist")
        .select([
            "app_kpop.name",
            "app_kpop_group.name as artist",
            "vlink as youtubeLink",
            "publishedon",
            "id_artist",
        ])
        .where("vtype", "=", "main")
        .where("publishedon", ">", oneMonthPriorDate)
        .orderBy("publishedon", "desc")
        .execute();

    if (result.length === 0) {
        logger.warn("recentMusicVideos generated no facts");
        return [];
    }

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.fun.newMV", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["name"] as string,
                x["artist"] as string,
                x["youtubeLink"] as string
            ),
            lng,
        })
    );
}

async function recentMusicShowWin(lng: LocaleType): Promise<string[]> {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 14);
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_ms")
        .innerJoin(
            "app_kpop_group",
            "app_kpop_ms.id_artist",
            "app_kpop_group.id"
        )
        .innerJoin("app_kpop", "app_kpop_ms.id_musicvideo", "app_kpop.id")
        .select([
            "app_kpop_ms.musicshow as music_show",
            "app_kpop_ms.date as win_date",
            "app_kpop_ms.musicname as winning_song",
            "app_kpop_group.name as artist_name",
            "app_kpop.vlink as link",
        ])
        .where("date", ">", twoWeeksPriorDate)
        .where("app_kpop_ms.id_musicvideo", "!=", 0)
        .execute();

    if (result.length === 0) {
        logger.warn("recentMusicShowWin generated no facts");
        return [];
    }

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.fun.recentMusicShowWin", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["winning_song"],
                x["artist_name"] as string,
                x["link"]
            ),
            musicShow: musicShows[x["music_show"] as keyof typeof musicShows],
            winDate: x["win_date"].toISOString().substring(0, 10),
            lng,
        })
    );
}

async function musicShowWins(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_ms")
        .innerJoin(
            "app_kpop_group",
            "app_kpop_ms.id_artist",
            "app_kpop_group.id"
        )
        .groupBy("app_kpop_ms.id_artist")
        .select(["app_kpop_group.name as artist_name"])
        .select((eb) => eb.fn.count<number>("id_artist").as("count"))
        .having(dbContext.kpopVideos.fn.count<number>("id_artist"), ">=", 5)
        .orderBy("count", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostMusicShowWins", {
            artist: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            num: x["count"],
            lng,
        })
    );
}

async function mostViewedGroups(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.name as artist_name"])
        .groupBy("app_kpop.id_artist")
        .select(
            dbContext.kpopVideos.fn
                .sum<number>("app_kpop.views")
                .as("total_views")
        )
        .where("issolo", "=", "n")
        .orderBy("total_views", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostViewedGroup", {
            artist: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            views: friendlyFormattedNumber(x["total_views"]),
            lng,
        })
    );
}

async function mostLikedGroups(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.name as artist_name"])
        .groupBy("app_kpop.id_artist")
        .select(
            dbContext.kpopVideos.fn
                .sum<number>("app_kpop.likes")
                .as("total_likes")
        )
        .where("issolo", "=", "n")
        .orderBy("total_likes", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostLikedGroup", {
            artist: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            likes: friendlyFormattedNumber(x["total_likes"]),
            lng,
        })
    );
}

async function mostViewedVideo(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select([
            "app_kpop_group.name as artist_name",
            "app_kpop.name as song_name",
            "app_kpop.views as views",
            "app_kpop.vlink as link",
        ])
        .where("vtype", "=", "main")
        .orderBy("views", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostViewedVideo", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["song_name"],
                x["artist_name"] as string,
                x["link"] as string
            ),
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            views: friendlyFormattedNumber(x["views"]),
            lng,
        })
    );
}

async function latestPak(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select([
            "app_kpop_group.name as artist_name",
            "app_kpop.name as song_name",
            "app_kpop.vlink as link",
            "app_kpop.releasedate as releasedate",
        ])
        .where("app_kpop.has_pak", "=", "y")
        .orderBy("releasedate", "desc")
        .limit(10)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.recentPak", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["song_name"],
                x["artist_name"] as string,
                x["link"]
            ),
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            releasedate: x["releasedate"],
            lng,
        })
    );
}

async function mostLikedVideo(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select([
            "app_kpop_group.name as artist_name",
            "app_kpop.name as song_name",
            "app_kpop.likes as likes",
            "app_kpop.vlink as link",
        ])
        .orderBy("likes", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostLikedVideo", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["song_name"],
                x["artist_name"] as string,
                x["link"]
            ),
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            likes: friendlyFormattedNumber(x["likes"]),
            lng,
        })
    );
}

async function mostViewedEntertainmentCompany(
    lng: LocaleType
): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .innerJoin(
            "app_kpop_company",
            "app_kpop_company.id",
            "app_kpop_group.id_company"
        )
        .select(["app_kpop_company.name as name"])
        .groupBy("app_kpop_group.id_company")
        .select((eb) => eb.fn.sum<number>("app_kpop.views").as("views"))
        .orderBy("views", "desc")
        .limit(15)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.companyByArtistViews", {
            name: x["name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            views: friendlyFormattedNumber(x["views"]),
            lng,
        })
    );
}

async function mostArtistsEntertainmentCompany(
    lng: LocaleType
): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .innerJoin(
            "app_kpop_company",
            "app_kpop_company.id",
            "app_kpop_group.id_company"
        )
        .select(["app_kpop_company.name as name"])
        .where("is_collab", "=", "n")
        .groupBy("app_kpop_group.id_company")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .orderBy("count", "desc")
        .limit(15)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.companyByArtistCount", {
            company: x["name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            num: friendlyFormattedNumber(x["count"]),
            lng,
        })
    );
}

async function mostMusicVideos(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.name as artist_name"])
        .where("vtype", "=", "main")
        .groupBy("id_artist")
        .select((eb) => eb.fn.count<number>("id_artist").as("count"))
        .orderBy("count", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostMVs", {
            artist: x["artist_name"] as string,
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            num: x["count"],
            lng,
        })
    );
}

async function yearWithMostDebuts(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select("app_kpop_group.formation as formation_year")
        .where("formation", "!=", 0)
        .groupBy("formation")
        .select((eb) => eb.fn.count<number>("app_kpop_group.id").as("count"))
        .orderBy("count", "desc")
        .limit(15)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostDebuts", {
            year: x["formation_year"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            num: x["count"],
            lng,
        })
    );
}

async function yearWithMostReleases(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .select((eb) => eb.fn("YEAR", ["publishedon"]).as("release_year"))
        .groupBy("release_year")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("app_kpop.vtype", "=", "main")
        .orderBy("count", "desc")
        .limit(15)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostActiveYear", {
            year: String(x["release_year"]),
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            num: String(x["count"]),
            lng,
        })
    );
}

async function viewsByGender(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.members as gender"])
        .groupBy("app_kpop_group.members")
        .select((eb) => eb.fn.sum<number>("app_kpop.views").as("views"))
        .orderBy("views", "desc")
        .limit(25)
        .execute();

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
        i18n.internalLocalizer.t("fact.fun.viewsByGender", {
            totalViews: friendlyFormattedNumber(totalViews),
            maleViews: data.male.views,
            maleProportion: data.male.proportion,
            femaleViews: data.female.views,
            femaleProportion: data.female.proportion,
            coedViews: data.coed.views,
            coedProportion: data.coed.proportion,
            lng,
        }),
    ];
}

async function mostViewedSoloArtist(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.name as artist_name"])
        .groupBy("app_kpop.id_artist")
        .select((eb) => eb.fn.sum<number>("app_kpop.views").as("total_views"))
        .where("app_kpop_group.issolo", "=", "y")
        .orderBy("total_views", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostViewedSoloist", {
            artist: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            views: friendlyFormattedNumber(x["total_views"]),
            lng,
        })
    );
}

async function viewsBySolo(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.issolo as issolo"])
        .groupBy("issolo")
        .select((eb) => eb.fn.sum<number>("app_kpop.views").as("views"))
        .orderBy("views", "desc")
        .limit(25)
        .execute();

    const groupViews = result[0].views;
    const soloViews = result[1].views;
    const totalViews = groupViews + soloViews;
    const data = {
        group: {
            views: friendlyFormattedNumber(groupViews),
            proportion: ((100 * groupViews) / totalViews).toFixed(2),
        },
        solo: {
            views: friendlyFormattedNumber(soloViews),
            proportion: ((100 * soloViews) / totalViews).toFixed(2),
        },
    };

    return [
        i18n.internalLocalizer.t("fact.fun.viewsByArtistType", {
            totalViews: friendlyFormattedNumber(totalViews),
            groupViews: data.group.views,
            groupProportion: data.group.proportion,
            soloViews: data.solo.views,
            soloProportion: data.solo.proportion,
            lng,
        }),
    ];
}

async function songReleaseAnniversaries(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("available_songs")
        .select(["song_name_en", "artist_name_en", "link"])
        .select((eb) => eb.fn("YEAR", ["publishedon"]).as("publish_year"))
        .where(sql`WEEK(publishedon) = WEEK(NOW())`)
        .where(sql`YEAR(publishedon) != YEAR(NOW())`)
        .orderBy("views", "desc")
        .limit(25)
        .execute();

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.fun.oldMV", {
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
    const result = await dbContext.kmq
        .selectFrom("song_metadata")
        .innerJoin(
            "available_songs",
            "available_songs.link",
            "song_metadata.vlink"
        )
        .select(["song_name_en", "artist_name_en", "link", "rounds_played"])
        .select(sql`ROUND(correct_guesses/rounds_played * 100, 2)`.as("c"))
        .where("rounds_played", ">", 2500)
        .orderBy(sql`RAND()`)
        .limit(100)
        .execute();

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.kmq.guessRate", {
            hyperlink: generateSongArtistHyperlink(
                lng,
                x["song_name_en"],
                x["artist_name_en"],
                x["link"]
            ),
            percentage: x["c"],
            roundsPlayed: x["rounds_played"],
            lng,
        })
    );
}

async function bigThreeDominance(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select(["app_kpop_group.name as artist_name"])
        .groupBy("app_kpop.id_artist")
        .select((eb) => eb.fn.sum<number>("app_kpop.views").as("total_views"))
        .where("app_kpop_group.name", "in", ["Blackpink", "Twice", "BTS"])
        .orderBy("total_views", "desc")
        .execute();

    const totalViewsResult = await dbContext.kpopVideos
        .selectFrom("app_kpop")
        .select((eb) => eb.fn.sum<number>("views").as("total_views"))
        .execute();

    const bigThreeViews = result.reduce(
        (prev, current) => prev + current.total_views,
        0
    );

    const proportion = (100 * bigThreeViews) / totalViewsResult[0].total_views;

    return [
        i18n.internalLocalizer.t("fact.fun.bigThreeDominance", {
            bigThreeViews: friendlyFormattedNumber(bigThreeViews),
            proportion: proportion.toFixed(2),
            lng,
        }),
    ];
}

async function fanclubName(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["name", "fanclub"])
        .where("fanclub", "!=", "")
        .orderBy(sql`RAND()`)
        .limit(10)
        .execute();

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.fun.fanclubName", {
            name: x["name"],
            fanclub: x["fanclub"],
            lng,
        })
    );
}

async function closeBirthdays(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["name"])
        .select((eb) => eb.fn("MONTH", ["date_birth"]).as("birth_month"))
        .select(sql`DATE_FORMAT(date_birth, '%M %e')`.as("formatted_bday"))
        .where("date_birth", "is not", null)
        .where(sql`MONTH(date_birth) = MONTH(CURRENT_DATE())`)
        .limit(10)
        .execute();

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.fun.birthday", {
            name: x["name"],
            formattedDate: x["formatted_bday"],
            lng,
        })
    );
}

async function longestGame(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("game_sessions")
        .select([
            "rounds_played",
            "session_length",
            "num_participants",
            "avg_guess_time",
        ])
        .orderBy("session_length", "desc")
        .limit(1)
        .execute();

    if (result.length === 0) return [];
    const longestKmqGame = result[0];
    return [
        i18n.internalLocalizer.t("fact.kmq.longestGame", {
            sessionLength: friendlyFormattedNumber(
                longestKmqGame.session_length
            ),
            roundsPlayed: friendlyFormattedNumber(longestKmqGame.rounds_played),
            avgGuessTime: friendlyFormattedNumber(
                longestKmqGame.avg_guess_time
            ),
            numParticipants: friendlyFormattedNumber(
                longestKmqGame.num_participants
            ),
            lng,
        }),
    ];
}

async function mostGames(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("guilds")
        .select(["games_played", "songs_guessed"])
        .orderBy("games_played", "desc")
        .limit(1)
        .execute();

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        i18n.internalLocalizer.t("fact.kmq.mostActiveServer", {
            gamesPlayed: friendlyFormattedNumber(
                mostGamesPlayed.games_played as number
            ),
            songsGuessed: friendlyFormattedNumber(
                mostGamesPlayed.songs_guessed as number
            ),
            lng,
        }),
    ];
}

async function mostCorrectGuessed(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("guilds")
        .select(["games_played", "songs_guessed"])
        .orderBy("songs_guessed", "desc")
        .limit(1)
        .execute();

    if (result.length === 0) return [];
    const mostGamesPlayed = result[0];
    return [
        i18n.internalLocalizer.t("fact.kmq.mostCorrectGuessesServer", {
            gamesPlayed: friendlyFormattedNumber(
                mostGamesPlayed.games_played as number
            ),
            songsGuessed: friendlyFormattedNumber(
                mostGamesPlayed.songs_guessed as number
            ),
            lng,
        }),
    ];
}

async function globalTotalGames(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("game_sessions")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .execute();

    if (result.length === 0) return [];
    const totalGamesPlayed = result[0].count;
    return [
        i18n.internalLocalizer.t("fact.kmq.totalGames", {
            totalGamesPlayed: friendlyFormattedNumber(totalGamesPlayed),
            lng,
        }),
    ];
}

async function recentGameSessions(lng: LocaleType): Promise<string[]> {
    const oneWeeksPriorDate = new Date();
    oneWeeksPriorDate.setDate(oneWeeksPriorDate.getDate() - 7);
    const result = await dbContext.kmq
        .selectFrom("game_sessions")
        .where("start_date", ">", oneWeeksPriorDate)
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .executeTakeFirstOrThrow();

    const recentSessions = result!.count || 0;
    return [
        i18n.internalLocalizer.t("fact.kmq.recentSessions", {
            recentSessions: friendlyFormattedNumber(recentSessions),
            lng,
        }),
    ];
}

async function recentGameRounds(lng: LocaleType): Promise<string[]> {
    const oneWeekPriorDate = new Date();
    oneWeekPriorDate.setDate(oneWeekPriorDate.getDate() - 7);
    const result = await dbContext.kmq
        .selectFrom("game_sessions")
        .where("start_date", ">", oneWeekPriorDate)
        .select((eb) => eb.fn.sum<number>("rounds_played").as("count"))
        .executeTakeFirst();

    const recentGameCount = (result!.count || 0) as number;
    return [
        i18n.internalLocalizer.t("fact.kmq.recentRounds", {
            recentGameCount: friendlyFormattedNumber(recentGameCount),
            lng,
        }),
    ];
}

async function recentUniquePlayers(lng: LocaleType): Promise<string[]> {
    const intervals = [1, 7, 30];
    return Promise.all(
        intervals.map(async (interval): Promise<string> => {
            const priorDate = new Date();
            priorDate.setDate(priorDate.getDate() - interval);
            const result = await dbContext.kmq
                .selectFrom("player_stats")
                .where("last_active", ">", priorDate)
                .select((eb) => eb.fn.countAll<number>().as("count"))
                .executeTakeFirst();

            const recentActivePlayers = result!.count || 0;
            const fact = i18n.internalLocalizer.t("fact.kmq.uniquePlayers", {
                recentActivePlayers:
                    friendlyFormattedNumber(recentActivePlayers),
                xDays: i18n.internalLocalizer.t("misc.plural.day", {
                    count: interval,
                    lng,
                }),
                lng,
            });

            return fact;
        })
    );
}

async function mostSongsGuessedPlayer(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("player_stats")
        .select(["songs_guessed"])
        .orderBy("songs_guessed", "desc")
        .limit(1)
        .execute();

    if (result.length === 0) return [];
    return [
        i18n.internalLocalizer.t("fact.kmq.mostActivePlayerSongsGuessed", {
            songsGuessed: friendlyFormattedNumber(
                result[0].songs_guessed as number
            ),
            lng,
        }),
    ];
}

async function mostGamesPlayedPlayer(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kmq
        .selectFrom("player_stats")
        .select(["games_played"])
        .orderBy("games_played", "desc")
        .limit(1)
        .execute();

    if (result.length === 0) return [];
    return [
        i18n.internalLocalizer.t("fact.kmq.mostActivePlayerGamesPlayed", {
            gamesPlayed: friendlyFormattedNumber(
                result[0].games_played as number
            ),
            lng,
        }),
    ];
}

async function mostGaonFirsts(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["name as artist_name", "gaondigital_firsts as firsts"])
        .orderBy("firsts", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostGaonFirsts", {
            artistName: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            firstPlaceCount: x["firsts"],
            lng,
        })
    );
}

async function mostGaonAppearances(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["name as artist_name", "gaondigital_times as appearances"])
        .orderBy("appearances", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostGaonAppearances", {
            artistName: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            appearances: x["appearances"],
            lng,
        })
    );
}

async function mostAnnualAwardShowWins(lng: LocaleType): Promise<string[]> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["name as artist_name", "yawards_total as wins"])
        .orderBy("wins", "desc")
        .limit(25)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.mostAnnualAwardShowWins", {
            artistName: x["artist_name"],
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            wins: x["wins"],
            lng,
        })
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

    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_gaondigi")
        .select(["ranklist", "year", "week"])
        .where("week", "=", week)
        .where("year", "in", yearRange)
        .orderBy("year", "desc")
        .execute();

    const parsedResults = result.map((x) =>
        parseGaonWeeklyRankList(x["ranklist"], x["year"])
    );

    return parsedResults.map((x) =>
        i18n.internalLocalizer.t("fact.fun.historicalGaonWeekly", {
            year: x[0].year,
            songName: generateSongArtistHyperlink(
                lng,
                x[0].songName,
                x[0].artistName
            ),
            lng,
        })
    );
}

async function recentGaonWeekly(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_kpop_gaondigi")
        .select(["ranklist", "year", "week"])
        .orderBy("year", "desc")
        .orderBy("week", "desc")
        .limit(1)
        .execute();

    const parsedResult = parseGaonWeeklyRankList(
        result[0].ranklist,
        result[0].year
    );

    return parsedResult.slice(0, 10).map((x, idx) =>
        i18n.internalLocalizer.t("fact.fun.recentGaonWeekly", {
            songName: generateSongArtistHyperlink(
                lng,
                x["songName"],
                x["artistName"]
            ),
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            lng,
        })
    );
}

async function topLeveledPlayers(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext.kmq
        .selectFrom("player_stats")
        .select(["songs_guessed", "games_played", "level"])
        .orderBy("exp", "desc")
        .limit(10)
        .execute();

    return result.map((x, idx) =>
        i18n.internalLocalizer.t("fact.kmq.highestLeveledPlayerStats", {
            ordinalNum: i18n.internalLocalizer.t(getOrdinalNum(idx + 1), {
                lng,
            }),
            level: `\`${x["level"]}\``,
            songsGuessed: `\`${friendlyFormattedNumber(
                x["songs_guessed"] as number
            )}\``,
            gamesPlayed: `\`${friendlyFormattedNumber(
                x["games_played"] as number
            )}\``,
            lng,
        })
    );
}

async function upcomingReleases(lng: LocaleType): Promise<Array<string>> {
    const result = await dbContext.kpopVideos
        .selectFrom("app_upcoming")
        .innerJoin(
            "app_kpop_group",
            "app_upcoming.id_artist",
            "app_kpop_group.id"
        )
        .select([
            "app_upcoming.rdate as release_date",
            "app_upcoming.rtype as release_type",
            "app_upcoming.name as release_name",
            "app_kpop_group.name as artist_name",
        ])
        .select(sql`DATEDIFF(rdate, NOW())`.as("diff"))
        .where(sql`DATEDIFF(rdate, NOW()) >= 1`)
        .where(sql`DATEDIFF(rdate, NOW()) < 31`)
        .where("app_upcoming.name", "<>", "")
        .execute();

    return result.map((x) =>
        i18n.internalLocalizer.t("fact.fun.upcomingReleases", {
            releaseName: x["release_name"],
            artistName: italicize(x["artist_name"] as string),
            releaseType: x["release_type"],
            dateString: `${discordDateFormat(
                x["release_date"],
                "d"
            )} (${discordDateFormat(x["release_date"], "R")})`,
            lng,
        })
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

    return i18n.internalLocalizer.t("fact.fun.hyperlinkGenerator", {
        songName,
        artistName,
        url,
        lng,
    });
}
