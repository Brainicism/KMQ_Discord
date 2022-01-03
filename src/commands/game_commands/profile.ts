/* eslint-disable @typescript-eslint/dot-notation */
import Eris from "eris";
import dbContext from "../../database_context";
import {
    fetchUser,
    getDebugLogHeader,
    getUserTag,
    sendErrorMessage,
    sendInfoMessage,
    tryCreateInteractionErrorAcknowledgement,
} from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import {
    friendlyFormattedDate,
    romanize,
    friendlyFormattedNumber,
} from "../../helpers/utils";
import { CUM_EXP_TABLE } from "../../structures/game_session";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("profile");

const RANK_TITLES = [
    { title: "profile.rank.novice", req: 0 },
    { title: "profile.rank.trainee", req: 10 },
    { title: "profile.rank.preDebut", req: 20 },
    { title: "profile.rank.nugu", req: 30 },
    { title: "profile.rank.newAoty", req: 40 },
    { title: "profile.rank.aoty", req: 50 },
    { title: "profile.rank.bonsang", req: 60 },
    { title: "profile.rank.daesang", req: 70 },
    { title: "profile.rank.ceo", req: 80 },
    { title: "profile.rank.president", req: 90 },
    { title: "profile.rank.reuniter", req: 100 },
    { title: "profile.rank.ruler", req: 110 },
    { title: "profile.rank.supreme", req: 120 },
    { title: "profile.rank.benevolent", req: 130 },
    { title: "profile.rank.almighty", req: 140 },
    { title: "profile.rank.divine", req: 150 },
    { title: "profile.rank.enlightened", req: 160 },
    { title: "profile.rank.immortal", req: 170 },
    { title: "profile.rank.omniscient", req: 180 },
];

/**
 * @param level - The user's level
 * @param guildID - The guild ID
 * @returns a string describing the user's rank corresponding with their level
 */
export function getRankNameByLevel(level: number, guildID: string): string {
    const highestRankTitle = RANK_TITLES[RANK_TITLES.length - 1];
    const levelsPastMaxRank = level - (highestRankTitle.req + 10);
    if (levelsPastMaxRank >= 0) {
        // add roman numeral suffix for every 5 levels above max rank title
        const stepsAboveMaxRank = Math.floor(levelsPastMaxRank / 5) + 1;
        return `${state.localizer.translate(
            guildID,
            highestRankTitle.title
        )} ${romanize(stepsAboveMaxRank + 1)}`;
    }

    for (let i = RANK_TITLES.length - 1; i >= 0; i--) {
        const rankTitle = RANK_TITLES[i];
        if (level >= rankTitle.req)
            return state.localizer.translate(guildID, rankTitle.title);
    }

    return state.localizer.translate(guildID, RANK_TITLES[0].title);
}

async function getProfileFields(
    requestedPlayer: Eris.User,
    guildID: string
): Promise<Array<Eris.EmbedField>> {
    const playerStats = await dbContext
        .kmq("player_stats")
        .select(
            "songs_guessed",
            "games_played",
            "first_play",
            "last_active",
            "exp",
            "level"
        )
        .where("player_id", "=", requestedPlayer.id)
        .first();

    if (!playerStats) {
        return [];
    }

    const songsGuessed = playerStats["songs_guessed"];
    const gamesPlayed = playerStats["games_played"];
    const firstPlayDateString = friendlyFormattedDate(
        new Date(playerStats["first_play"]),
        guildID
    );

    const lastActiveDateString = friendlyFormattedDate(
        new Date(playerStats["last_active"]),
        guildID
    );

    const exp = playerStats["exp"];
    const level = playerStats["level"];

    const totalPlayers = (
        await dbContext
            .kmq("player_stats")
            .count("* as count")
            .where("exp", ">", "0")
            .first()
    )["count"] as number;

    const relativeSongRank = Math.min(
        ((
            await dbContext
                .kmq("player_stats")
                .count("* as count")
                .where("songs_guessed", ">", songsGuessed)
                .where("exp", ">", "0")
                .first()
        )["count"] as number) + 1,
        totalPlayers
    );

    const relativeGamesPlayedRank = Math.min(
        ((
            await dbContext
                .kmq("player_stats")
                .count("* as count")
                .where("games_played", ">", gamesPlayed)
                .where("exp", ">", "0")
                .first()
        )["count"] as number) + 1,
        totalPlayers
    );

    const relativeLevelRank = Math.min(
        ((
            await dbContext
                .kmq("player_stats")
                .count("* as count")
                .where("exp", ">", exp)
                .first()
        )["count"] as number) + 1,
        totalPlayers
    );

    const timesVotedData = await dbContext
        .kmq("top_gg_user_votes")
        .select(["total_votes"])
        .where("user_id", "=", requestedPlayer.id)
        .first();

    const timesVoted = timesVotedData ? timesVotedData["total_votes"] : 0;

    const fields: Array<Eris.EmbedField> = [
        {
            name: state.localizer.translate(guildID, "misc.level"),
            value: `${friendlyFormattedNumber(level)} (${getRankNameByLevel(
                level,
                guildID
            )})`,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.experience"),
            value: `${friendlyFormattedNumber(exp)}/${friendlyFormattedNumber(
                CUM_EXP_TABLE[level + 1]
            )}`,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.overallRank"),
            value: `#${friendlyFormattedNumber(
                relativeLevelRank
            )}/${friendlyFormattedNumber(totalPlayers)}`,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.songsGuessed"),
            value: `${friendlyFormattedNumber(
                songsGuessed
            )} | #${friendlyFormattedNumber(
                relativeSongRank
            )}/${friendlyFormattedNumber(totalPlayers)} `,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.gamesPlayed"),
            value: `${friendlyFormattedNumber(
                gamesPlayed
            )} | #${friendlyFormattedNumber(
                relativeGamesPlayedRank
            )}/${friendlyFormattedNumber(totalPlayers)} `,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.firstPlayed"),
            value: firstPlayDateString,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.lastActive"),
            value: lastActiveDateString,
            inline: true,
        },
        {
            name: state.localizer.translate(guildID, "profile.timesVoted"),
            value: friendlyFormattedNumber(timesVoted),
            inline: true,
        },
    ];

    // Optional fields
    const badges = (
        await dbContext
            .kmq("badges_players")
            .select(["badges.name as badge_name"])
            .where("user_id", "=", requestedPlayer.id)
            .join("badges", function join() {
                this.on("badges_players.badge_id", "=", "badges.id");
            })
            .orderBy("badges.priority", "desc")
    )
        .map((x) => state.localizer.translate(guildID, x["badge_name"]))
        .join("\n");

    if (badges) {
        fields.push({
            name: state.localizer.translate(guildID, "profile.badges"),
            value: badges,
            inline: false,
        });
    }

    return fields;
}

export default class ProfileCommand implements BaseCommand {
    help = (guildID: string): Help => ({
        name: "profile",
        description: state.localizer.translate(
            guildID,
            "profile.help.description"
        ),
        usage: ",profile { @mention }",
        examples: [
            {
                example: "`,profile`",
                explanation: state.localizer.translate(
                    guildID,
                    "profile.help.example.self"
                ),
            },
            {
                example: "`,profile @FortnitePlayer`",
                explanation: state.localizer.translate(
                    guildID,
                    "profile.help.example.otherPlayerMention",
                    {
                        playerName: "FortnitePlayer",
                    }
                ),
            },
            {
                example: "`,profile 141734249702096896`",
                explanation: state.localizer.translate(
                    guildID,
                    "profile.help.example.otherPlayerID"
                ),
            },
        ],
        priority: 50,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let requestedPlayer: Eris.User;
        if (parsedMessage.components.length === 0) {
            requestedPlayer = message.author;
        } else if (parsedMessage.components.length === 1) {
            if (message.mentions.length === 1) {
                requestedPlayer = message.mentions[0];
            } else {
                try {
                    requestedPlayer = await fetchUser(
                        parsedMessage.argument,
                        true
                    );
                } catch (e) {
                    requestedPlayer = null;
                }

                if (!requestedPlayer) {
                    sendErrorMessage(MessageContext.fromMessage(message), {
                        title: state.localizer.translate(
                            message.guildID,
                            "profile.failure.notFound.title"
                        ),
                        description: state.localizer.translate(
                            message.guildID,
                            "profile.failure.notFound.description",
                            {
                                profileHelp: `\`${process.env.BOT_PREFIX}help profile\``,
                            }
                        ),
                    });
                    return;
                }
            }
        } else {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "profile.failure.notFound.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "profile.failure.notFound.badUsage.description",
                    { profileHelp: `\`${process.env.BOT_PREFIX}help profile\`` }
                ),
            });
            return;
        }

        const fields = await getProfileFields(requestedPlayer, message.guildID);

        if (fields.length === 0) {
            sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "profile.failure.notFound.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.profile.noStats"
                ),
            });
            return;
        }

        logger.info(
            `${getDebugLogHeader(
                MessageContext.fromMessage(message)
            )} | Profile retrieved`
        );

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: getUserTag(requestedPlayer),
            fields,
            author: {
                username: requestedPlayer.username,
                avatarUrl: requestedPlayer.avatarURL,
            },
            timestamp: new Date(),
        });
    };
}

/**
 * Responds to the profile interaction
 * @param interaction - The originating interaction
 * @param userId - The ID of the user retrieve profile information from
 */
export async function handleProfileInteraction(
    interaction: Eris.CommandInteraction,
    userId: string
): Promise<void> {
    const user = await state.ipc.fetchUser(userId);
    if (!user) {
        tryCreateInteractionErrorAcknowledgement(
            interaction,
            state.localizer.translate(
                interaction.guildID,
                "misc.interaction.profile.inaccessible",
                {
                    profileUserID: `\`${process.env.BOT_PREFIX}profile ${userId}\``,
                }
            )
        );

        logger.info(
            `${getDebugLogHeader(
                interaction
            )} | Failed retrieving profile on inaccessible player via interaction`
        );
        return;
    }

    const fields = await getProfileFields(user, interaction.guildID);
    if (fields.length === 0) {
        tryCreateInteractionErrorAcknowledgement(
            interaction,
            state.localizer.translate(
                interaction.guildID,
                "misc.interaction.profile.noStats"
            )
        );

        logger.info(
            `${getDebugLogHeader(
                interaction
            )} | Empty profile retrieved via interaction`
        );
        return;
    }

    try {
        await interaction.createMessage({
            embeds: [
                {
                    title: getUserTag(user),
                    fields,
                    timestamp: new Date(),
                },
            ],
            flags: 64,
        });

        logger.info(
            `${getDebugLogHeader(
                interaction
            )} | Profile retrieved via interaction`
        );
    } catch (err) {
        logger.error(
            `${getDebugLogHeader(
                interaction
            )} | Interaction acknowledge failed. err = ${err.stack}`
        );
    }
}
