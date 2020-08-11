import { db } from "./databases";

const musicShows = {
    "inkigayo": "Inkigayo",
    "countdown": "Countdown",
    "theshow": "The Show",
    "musiccore": "Show! Music Core",
    "musicbank": "Music Bank",
    "showchampion": "Show Champion"
}
function chooseRandom(list: Array<any>) {
    return list[Math.floor(Math.random() * list.length)];
}

function getOrdinalNum(n: number): string {
    return n + (n > 0 ? ['th', 'st', 'nd', 'rd'][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : '');
}

async function recentMusicVideo() {
    const oneMonthPriorDate = new Date();
    oneMonthPriorDate.setMonth(oneMonthPriorDate.getMonth() - 1);
    const result = await db.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink", "publishedon"])
        .join("kpop_videos.app_kpop_group", function () {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id")
        })
        .where("dead", "n")
        .andWhere("vtype", "main")
        .andWhere("publishedon", ">", oneMonthPriorDate)
        .orderBy("kpop_videos.app_kpop.publishedon", "DESC")
    const randomSong = chooseRandom(result);
    return `New Song Alert: Check out this recently released music video, '${randomSong.name}' by '${randomSong.artist}'!\nhttps://youtu.be/${randomSong.youtubeLink}`
}

async function recentMilestone() {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 14);
    const result = await db.kpopVideos("app_kpop_miles")
        .select(["app_kpop_miles.mvalue as milestone_views", "app_kpop_miles.data as milestone_data", "app_kpop.nome as song_name", "app_kpop_group.name as artist_name"])
        .where("data", ">", twoWeeksPriorDate)
        .join("app_kpop", function () {
            this.on("app_kpop.id", "=", "app_kpop_miles.id_mv")
        })
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
    const randomSong = chooseRandom(result);
    return `Fun Fact: '${randomSong.song_name}' - '${randomSong.artist_name}' recently reached ${randomSong["milestone_views"].toLocaleString()} views on YouTube!`
}

async function recentMusicShowWin() {
    const twoWeeksPriorDate = new Date();
    twoWeeksPriorDate.setDate(twoWeeksPriorDate.getDate() - 7);
    const result = await db.kpopVideos("app_kpop_ms")
        .select(["app_kpop_ms.musicshow as music_show", "app_kpop_ms.data as win_date", "app_kpop_group.name as artist_name"])
        .where("data", ">", twoWeeksPriorDate)
        .join("app_kpop_group", function () {
            this.on("app_kpop_ms.id_artist", "=", "app_kpop_group.id")
        })
    const randomWin = chooseRandom(result);
    const musicShow = randomWin.music_show;

    return `Fun Fact: '${randomWin.artist_name}' recently won on ${musicShows[musicShow]} on ${randomWin.win_date.toISOString().substring(0, 10)}!`
}

async function musicShowWins() {
    const result = await db.kpopVideos("app_kpop_ms")
        .select(["app_kpop_group.name as artist_name"])
        .count("app_kpop_ms.id_artist as count")
        .groupBy("app_kpop_ms.id_artist")
        .having("count", ">=", 5)
        .join("app_kpop_group", function () {
            this.on("app_kpop_ms.id_artist", "=", "app_kpop_group.id")
        })
        .limit(25)
        .orderBy("count", "DESC");
    const position = Math.floor(Math.random() * result.length);
    const musicShowWinner = result[position];
    return `Fun Fact: '${musicShowWinner.artist_name}' has won the ${getOrdinalNum(position + 1)} most music show with ${musicShowWinner.count} wins!`
}

async function mostViewedGroups() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .limit(25)
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .where("app_kpop_group.issolo", "=", "n")
        .orderBy("total_views", "DESC")
    const position = Math.floor(Math.random() * result.length);
    const mostViewedGroup = result[position];
    return `Fun Fact: '${mostViewedGroup.artist_name}' is the ${getOrdinalNum(position + 1)} most viewed group with ${mostViewedGroup.total_views.toLocaleString()} total YouTube views!`
}

async function mostLikedGroups() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.likes as total_likes")
        .groupBy("app_kpop.id_artist")
        .limit(25)
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .where("app_kpop_group.issolo", "=", "n")
        .orderBy("total_likes", "DESC")
    const position = Math.floor(Math.random() * result.length);
    const mostLikedGroup = result[position];
    return `Fun Fact: '${mostLikedGroup.artist_name}' is the ${getOrdinalNum(position + 1)} most liked group with ${mostLikedGroup.total_likes.toLocaleString()} total YouTube likes!`
}


async function mostViewedVideo() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name", "app_kpop.nome as song_name", "app_kpop.views as views"])
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .where("app_kpop.vtype", "main")
        .limit(25)
        .orderBy("views", "DESC")
    const position = Math.floor(Math.random() * result.length);
    const mostViewedVideo = result[position];
    return `Fun Fact: '${mostViewedVideo.song_name}' - '${mostViewedVideo.artist_name}' is the ${getOrdinalNum(position + 1)} most viewed music video with ${mostViewedVideo.views.toLocaleString()} YouTube views!`
}

async function mostLikedVideo() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name", "app_kpop.nome as song_name", "app_kpop.likes as likes"])
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .limit(25)
        .orderBy("likes", "DESC")
    const position = Math.floor(Math.random() * result.length);
    const mostViewedVideo = result[position];
    return `Fun Fact: '${mostViewedVideo.song_name}' - ${mostViewedVideo.artist_name} is the ${getOrdinalNum(position + 1)} most liked music video with ${mostViewedVideo.likes.toLocaleString()} YouTube likes!`
}

async function mostMusicVideos() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .where("vtype", "=", "main")
        .count("app_kpop.id_artist as count")
        .groupBy("id_artist")
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .limit(25)
        .orderBy("count", "DESC");
    const position = Math.floor(Math.random() * result.length);
    const mostMusicVideoGroup = result[position];

    return `Fun Fact: '${mostMusicVideoGroup.artist_name}' has the ${getOrdinalNum(position + 1)} most music videos with ${mostMusicVideoGroup.count} on YouTube!`
}
async function yearWithMostDebuts() {
    const result = await db.kpopVideos("app_kpop_group")
        .select("app_kpop_group.formation as formation_year")
        .count("app_kpop_group.id as count")
        .where("formation", "!=", 0)
        .groupBy("app_kpop_group.formation")
        .orderBy("count", "DESC")
        .limit(15)
    const position = Math.floor(Math.random() * result.length);
    const yearWithMostDebut = result[position];
    return `Fun Fact: ${yearWithMostDebut.formation_year} had the ${getOrdinalNum(position + 1)} most debuts with ${yearWithMostDebut.count} groups debuting!`
}

async function yearWithMostReleases() {
    const result = await db.kpopVideos("app_kpop")
        .select(db.kpopVideos.raw("YEAR(app_kpop.publishedon) as release_year"))
        .count("* as count")
        .where("app_kpop.vtype", "=", "main")
        .groupBy("release_year")
        .orderBy("count", "DESC")
        .limit(15)

    const position = Math.floor(Math.random() * result.length);
    const yearWithMostReleases = result[position];
    return `Fun Fact: ${yearWithMostReleases.release_year} was the ${getOrdinalNum(position + 1)} most active year in K-Pop with ${yearWithMostReleases.count} music video releases!`
}

async function viewsByGender() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.members as gender"])
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .groupBy("app_kpop_group.members")
        .sum("app_kpop.views as views")
        .orderBy("views", "DESC")
        .limit(25)

    let data = {};
    let totalViews = 0;
    for (let genderViews of result) {
        totalViews += genderViews.views;
    }
    for (let genderViews of result) {
        data[genderViews.gender] = {
            views: genderViews.views.toLocaleString(),
            proportion: (100 * genderViews.views / totalViews).toFixed(2)
        }
    }
    return `Fun Fact: There is a combined total of ${totalViews.toLocaleString()} views on all K-Pop music videos on YouTube. ${data["male"].views} (${data["male"].proportion}%) of which are from male, ${data["female"].views} (${data["female"].proportion}%) from female, and the remaining ${data["coed"].views} (${data["coed"].proportion}%) from co-ed groups!`
}

async function mostViewedSoloArtist() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .where("app_kpop_group.issolo", "=", "y")
        .orderBy("total_views", "DESC")
        .limit(25)
    const position = Math.floor(Math.random() * result.length);
    const mostViewedArtist = result[position];
    return `Fun Fact: '${mostViewedArtist.artist_name}' is the ${getOrdinalNum(position + 1)} most viewed solo artist with ${mostViewedArtist.total_views.toLocaleString()} total YouTube views!`
}

async function viewsBySolo() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.issolo as issolo"])
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .groupBy("app_kpop_group.issolo")
        .sum("app_kpop.views as views")
        .orderBy("issolo", "DESC")
        .limit(25)
    const totalViews = result[0].views + result[1].views;
    const data = {
        "group": {
            views: result[0].views.toLocaleString(),
            proportion: (100 * result[0].views / totalViews).toFixed(2)
        },
        "solo": {
            views: result[1].views.toLocaleString(),
            proportion: (100 * result[1].views / totalViews).toFixed(2)
        }
    }
    return `Fun Fact: There is a combined total of ${totalViews.toLocaleString()} views on all K-Pop music videos on YouTube. ${data["group"].views} (${data["group"].proportion}%) of which are groups, while ${data["solo"].views} (${data["solo"].proportion}%) are from solo artists!`
}


async function mostViewsPerDay() {
    const result = await db.kpopVideos("app_kpop")
        .select(db.kpopVideos.raw("DATEDIFF(NOW(), publishedon) as days_since, ROUND(app_kpop.views/DATEDIFF(NOW(), publishedon)) as views_per_day, app_kpop.nome as song_name, app_kpop_group.name as artist_name"))
        .where("app_kpop.vtype", "=", "main")
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .orderBy("views_per_day", "DESC")
        .limit(25)
    const position = Math.floor(Math.random() * result.length);
    const mostViewsPerDay = result[position];
    return `Fun Fact: '${mostViewsPerDay["song_name"]}' - '${mostViewsPerDay["artist_name"]}' is the music video with the ${getOrdinalNum(position + 1)} most views per day, averaging ${mostViewsPerDay["views_per_day"].toLocaleString()} over ${mostViewsPerDay["days_since"]} days!`
}


async function bigThreeDominance() {
    const result = await db.kpopVideos("app_kpop")
        .select(["app_kpop_group.name as artist_name"])
        .sum("app_kpop.views as total_views")
        .groupBy("app_kpop.id_artist")
        .join("app_kpop_group", function () {
            this.on("app_kpop.id_artist", "=", "app_kpop_group.id")
        })
        .whereIn("app_kpop_group.name", ["Blackpink", "Twice", "BTS"])
        .orderBy("total_views", "DESC")

    const totalViewsResult = await db.kpopVideos("app_kpop")
        .sum("views as total_views");
    const bigThreeViews = result.reduce((prev, current) => { return prev + current.total_views }, 0);
    const proportion = 100 * bigThreeViews / totalViewsResult[0].total_views;
    return `Fun Fact: BTS, Blackpink and Twice combined account for ${bigThreeViews.toLocaleString()} YouTube views, or ${proportion.toFixed(2)}%!`
}

async function longestGame() {
    const result = await db.kmq("game_sessions")
        .select(["rounds_played", "session_length", "num_participants", "avg_guess_time"])
        .orderBy("session_length", "DESC");
    const longestKmqGame = result[0];
    return `KMQ Fact: The world's (current) longest game of KMQ lasted ${longestKmqGame.session_length} minutes, with over ${longestKmqGame.rounds_played} songs played, an average guess time of ${longestKmqGame.avg_guess_time} seconds, with ${longestKmqGame.num_participants} participants! Can you beat that?`
}

async function mostGames() {
    const result = await db.kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("games_played", "DESC")
    const mostGamesPlayed = result[0];
    return `KMQ Fact: The most active server has played ${mostGamesPlayed.games_played} games of KMQ, with a total of ${mostGamesPlayed.songs_guessed} songs guessed!`
}

async function mostCorrectGuessed() {
    const result = await db.kmq("guild_preferences")
        .select("games_played", "songs_guessed")
        .orderBy("songs_guessed", "DESC")
    const mostGamesPlayed = result[0];
    return `KMQ Fact: The server with the most correct guesses has played ${mostGamesPlayed.games_played} games of KMQ, with a total of ${mostGamesPlayed.songs_guessed} songs guessed!`
}


async function globalTotalGames() {
    const result = await db.kmq("game_sessions")
        .count("* as count")
    const totalGamesPlayed = result[0].count;
    return `KMQ Fact: A grand total of ${totalGamesPlayed} games of KMQ have been played!`
}

async function recentGameSessions() {
    const oneWeeksPriorDate = new Date();
    oneWeeksPriorDate.setDate(oneWeeksPriorDate.getDate() - 7);
    const result = await db.kmq("game_sessions")
        .count("* as count")
        .where("start_date", ">", oneWeeksPriorDate);
    let recentGameSessions = result[0].count;
    return `KMQ Fact: A total of ${recentGameSessions} games of KMQ have been played in the last week!`
}

async function genderGamePreferences() {
    const oneWeekPriorDate = new Date();
    oneWeekPriorDate.setDate(oneWeekPriorDate.getDate() - 7);
    const result = await db.kmq("guild_preferences")
        .select("guild_preference")
        .where("last_active", ">", oneWeekPriorDate);
    const preferenceCount = result.length;
    let maleCount = 0;
    let femaleCount = 0;
    for (let guild of result) {
        const guildPreference = JSON.parse(guild.guild_preference);
        const genderPreference = guildPreference.gameOptions.gender;
        if (genderPreference.length != 1) continue;
        if (genderPreference[0] === "male") maleCount++;
        if (genderPreference[0] === "female") femaleCount++;
    }
    const maleProportion = (100*(maleCount/preferenceCount)).toFixed(2);
    const femaleProportion = (100*(femaleCount/preferenceCount)).toFixed(2);
    return `KMQ Fact: ${femaleProportion}% of servers play with only girl group songs, while ${maleProportion}% play with boy groups only!`
}

(async () => {
    console.log(await recentMusicVideo());
    console.log(await recentMilestone());
    console.log(await recentMusicShowWin());
    console.log(await musicShowWins());
    console.log(await mostViewedGroups());
    console.log(await mostLikedGroups());
    console.log(await mostViewedVideo());
    console.log(await mostLikedVideo());
    console.log(await mostMusicVideos());
    console.log(await yearWithMostDebuts());
    console.log(await viewsByGender());
    console.log(await mostViewedSoloArtist());
    console.log(await mostViewsPerDay());
    console.log(await viewsBySolo());
    console.log(await yearWithMostReleases());
    console.log(await bigThreeDominance());
    console.log(await longestGame());
    console.log(await globalTotalGames());
    console.log(await mostGames());
    console.log(await mostCorrectGuessed());
    console.log(await recentGameSessions())
    console.log(await genderGamePreferences());
    //gender query preference
    //do null checks
})();


