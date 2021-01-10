/* eslint-disable @typescript-eslint/dot-notation */
import Eris from "eris";
import dbContext from "../../database_context";
import { getDebugLogHeader, getMessageContext, getUserTag, sendEmbed, sendInfoMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { bold, friendlyFormattedDate } from "../../helpers/utils";

const logger = _logger("profile");

export default class ProfileCommand implements BaseCommand {
    help = {
        name: "profile",
        description: "Shows your game stats.",
        usage: "!profile { @mention }",
        examples: [{
            example: "`!profile`",
            explanation: "View your own player profile.",
        },
        {
            example: "`!profile @FortnitePlayer`",
            explanation: "Views FortnitePlayer's player profile.",
        }],
        priority: 50,
    };

    async call({ message }: CommandArgs) {
        let requestedPlayer: Eris.User;
        if (message.mentions.length === 1) {
            requestedPlayer = message.mentions[0];
        } else {
            requestedPlayer = message.author;
        }

        const playerStats = await dbContext.kmq("player_stats")
            .select("songs_guessed", "games_played", "first_play", "last_active")
            .where("player_id", "=", requestedPlayer.id)
            .first();

        logger.info(`${getDebugLogHeader(message)} | Profile retrieved`);

        if (!playerStats) {
            sendInfoMessage(getMessageContext(message), "No profile found", "Play your first game to begin tracking your stats!");
            return;
        }

        const songsGuessed = playerStats["songs_guessed"];
        const gamesPlayed = playerStats["games_played"];
        const firstPlayDateString = friendlyFormattedDate(new Date(playerStats["first_play"]));
        const lastActiveDateString = friendlyFormattedDate(new Date(playerStats["last_active"]));

        const totalPlayers = (await dbContext.kmq("player_stats").count("* as count").first())["count"];
        const relativeSongRank = ((await dbContext.kmq("player_stats")
            .count("* as count")
            .where("songs_guessed", ">", songsGuessed)
            .first())["count"] as number) + 1;

        const relativeGamesPlayedRank = ((await dbContext.kmq("player_stats")
            .count("* as count")
            .where("games_played", ">", gamesPlayed)
            .first())["count"] as number) + 1;

        const fields: Array<Eris.EmbedField> = [{
            name: "Songs Guessed",
            value: `${songsGuessed} | #${relativeSongRank}/${totalPlayers} `,
        },
        {
            name: "Games Played",
            value: `${gamesPlayed} | #${relativeGamesPlayedRank}/${totalPlayers} `,
        },
        {
            name: "First Played",
            value: firstPlayDateString,
        },
        {
            name: "Last Active",
            value: lastActiveDateString,
        }];

        sendEmbed(message.channel, {
            title: bold(`${getUserTag(requestedPlayer)}`),
            fields,
            timestamp: new Date(),
        });
    }
}
