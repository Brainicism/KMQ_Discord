/* eslint-disable @typescript-eslint/dot-notation */
import Eris from "eris";
import dbContext from "../../database_context";
import { getDebugLogHeader, getUserTag, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { friendlyFormattedDate, romanize } from "../../helpers/utils";
import { CUM_EXP_TABLE } from "../../structures/game_session";
import MessageContext from "../../structures/message_context";
import state from "../../kmq";

const logger = _logger("profile");

const RANK_TITLES = [
    { title: "Novice", req: 0 },
    { title: "Trainee", req: 10 },
    { title: "Pre-debut", req: 20 },
    { title: "Nugu", req: 30 },
    { title: "New Artist Of The Year", req: 40 },
    { title: "Artist Of The Year", req: 50 },
    { title: "Bonsang Award Winner", req: 60 },
    { title: "Daesang Award Winner", req: 70 },
    { title: "CEO of KMQ Entertainment", req: 80 },
    { title: "President of South Korea", req: 90 },
    { title: "Reuniter of the Two Koreas", req: 100 },
    { title: "Ruler of the Two Koreas", req: 110 },
    { title: "Supreme Ruler of Asia", req: 120 },
    { title: "Benevolent Ruler of Earth", req: 130 },
    { title: "Divine Ruler of the Stars", req: 140 },
    { title: "Almighty Ruler of the Solar System", req: 150 },
    { title: "Enlightened Ruler of the Galaxy", req: 160 },
    { title: "Immortal Ruler of the Universe", req: 170 },
    { title: "Omniscient Ruler of the Multiverse", req: 180 },
];

export function getRankNameByLevel(level: number): string {
    const highestRankTitle = RANK_TITLES[RANK_TITLES.length - 1];
    const levelsPastMaxRank = level - (highestRankTitle.req + 10);
    if (levelsPastMaxRank >= 0) {
        // add roman numeral suffix for every 5 levels above max rank title
        const stepsAboveMaxRank = Math.floor(levelsPastMaxRank / 5) + 1;
        return `${highestRankTitle.title} ${romanize(stepsAboveMaxRank + 1)}`;
    }
    for (let i = RANK_TITLES.length - 1; i >= 0; i--) {
        const rankTitle = RANK_TITLES[i];
        if (level >= rankTitle.req) return rankTitle.title;
    }
    return RANK_TITLES[0].title;
}

export default class ProfileCommand implements BaseCommand {
    help = {
        name: "profile",
        description: "Shows your game stats.",
        usage: ",profile { @mention }",
        examples: [{
            example: "`,profile`",
            explanation: "View your own player profile.",
        },
        {
            example: "`,profile @FortnitePlayer`",
            explanation: "Views FortnitePlayer's player profile.",
        },
        {
            example: "`,profile 141734249702096896`",
            explanation: "Views a player profile based on their Discord ID.",
        }],
        priority: 50,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        let requestedPlayer: Eris.User;
        if (parsedMessage.components.length === 0) {
            requestedPlayer = message.author;
        } else if (message.mentions.length === 1) {
            requestedPlayer = message.mentions[0];
        } else {
            requestedPlayer = state.client.users.get(parsedMessage.argument);
            if (!requestedPlayer) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "No profile found", description: "Could not find the specified user ID. Make sure the user has been active recently." });
                return;
            }
        }

        const playerStats = await dbContext.kmq("player_stats")
            .select("songs_guessed", "games_played", "first_play", "last_active")
            .where("player_id", "=", requestedPlayer.id)
            .first();

        logger.info(`${getDebugLogHeader(message)} | Profile retrieved`);

        if (!playerStats) {
            sendInfoMessage(MessageContext.fromMessage(message), { title: "No profile found", description: "Play your first game to begin tracking your stats!" });
            return;
        }

        const songsGuessed = playerStats["songs_guessed"];
        const gamesPlayed = playerStats["games_played"];
        const firstPlayDateString = friendlyFormattedDate(new Date(playerStats["first_play"]));
        const lastActiveDateString = friendlyFormattedDate(new Date(playerStats["last_active"]));

        const totalPlayers = (await dbContext.kmq("player_stats")
            .count("* as count")
            .where("exp", ">", "0")
            .first())["count"] as number;

        const { exp, level } = (await dbContext.kmq("player_stats")
            .select(["exp", "level"])
            .where("player_id", "=", requestedPlayer.id)
            .first());

        const relativeSongRank = Math.min(((await dbContext.kmq("player_stats")
            .count("* as count")
            .where("songs_guessed", ">", songsGuessed)
            .where("exp", ">", "0")
            .first())["count"] as number) + 1, totalPlayers);

        const relativeGamesPlayedRank = Math.min(((await dbContext.kmq("player_stats")
            .count("* as count")
            .where("games_played", ">", gamesPlayed)
            .where("exp", ">", "0")
            .first())["count"] as number) + 1, totalPlayers);

        const relativeLevelRank = Math.min(((await dbContext.kmq("player_stats")
            .count("* as count")
            .where("exp", ">", exp)
            .first())["count"] as number) + 1, totalPlayers);

        const timesVotedData = (await dbContext.kmq("top_gg_user_votes")
            .select(["total_votes"])
            .where("user_id", "=", requestedPlayer.id)
            .first());

        const timesVoted = timesVotedData ? timesVotedData["total_votes"] : 0;

        const fields: Array<Eris.EmbedField> = [
            {
                name: "Level",
                value: `${level} (${getRankNameByLevel(level)})`,
                inline: true,
            },
            {
                name: "Experience",
                value: `${exp}/${CUM_EXP_TABLE[level + 1]}`,
                inline: true,
            },
            {
                name: "Overall Rank",
                value: `#${relativeLevelRank}/${totalPlayers}`,
                inline: true,
            },
            {
                name: "Songs Guessed",
                value: `${songsGuessed} | #${relativeSongRank}/${totalPlayers} `,
                inline: true,
            },
            {
                name: "Games Played",
                value: `${gamesPlayed} | #${relativeGamesPlayedRank}/${totalPlayers} `,
                inline: true,
            },
            {
                name: "First Played",
                value: firstPlayDateString,
                inline: true,
            },
            {
                name: "Last Active",
                value: lastActiveDateString,
                inline: true,
            },
            {
                name: "Times Voted",
                value: timesVoted,
                inline: true,
            }];

        // Optional fields
        const badges = (await dbContext.kmq("badges")
            .select(["badge_name"])
            .where("user_id", "=", requestedPlayer.id))
            .map((x) => x["badge_name"])
            .join("\n");
        if (badges) {
            fields.push({
                name: "Badges",
                value: badges,
                inline: false,
            });
        }

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: getUserTag(requestedPlayer),
            fields,
            author: {
                username: requestedPlayer.username,
                avatarUrl: requestedPlayer.avatarURL,
            },
            timestamp: new Date(),
        });
    }
}
