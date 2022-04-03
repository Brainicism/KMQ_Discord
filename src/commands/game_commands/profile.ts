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
import {
    friendlyFormattedDate,
    friendlyFormattedNumber,
    romanize,
} from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import { CUM_EXP_TABLE } from "../../structures/game_session";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("profile");

const RANK_TITLES = [
    { req: 0, title: "command.profile.rank.novice" },
    { req: 10, title: "command.profile.rank.trainee" },
    { req: 20, title: "command.profile.rank.preDebut" },
    { req: 30, title: "command.profile.rank.nugu" },
    { req: 40, title: "command.profile.rank.newAoty" },
    { req: 50, title: "command.profile.rank.aoty" },
    { req: 60, title: "command.profile.rank.bonsang" },
    { req: 70, title: "command.profile.rank.daesang" },
    { req: 80, title: "command.profile.rank.ceo" },
    { req: 90, title: "command.profile.rank.president" },
    { req: 100, title: "command.profile.rank.reuniter" },
    { req: 110, title: "command.profile.rank.ruler" },
    { req: 120, title: "command.profile.rank.supreme" },
    { req: 130, title: "command.profile.rank.benevolent" },
    { req: 140, title: "command.profile.rank.divine" },
    { req: 150, title: "command.profile.rank.almighty" },
    { req: 160, title: "command.profile.rank.enlightened" },
    { req: 170, title: "command.profile.rank.immortal" },
    { req: 180, title: "command.profile.rank.omniscient" },
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
            inline: true,
            name: state.localizer.translate(guildID, "misc.level"),
            value: `${friendlyFormattedNumber(level)} (${getRankNameByLevel(
                level,
                guildID
            )})`,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.experience"
            ),
            value: `${friendlyFormattedNumber(exp)}/${friendlyFormattedNumber(
                CUM_EXP_TABLE[level + 1]
            )}`,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.overallRank"
            ),
            value: `#${friendlyFormattedNumber(
                relativeLevelRank
            )}/${friendlyFormattedNumber(totalPlayers)}`,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.songsGuessed"
            ),
            value: `${friendlyFormattedNumber(
                songsGuessed
            )} | #${friendlyFormattedNumber(
                relativeSongRank
            )}/${friendlyFormattedNumber(totalPlayers)} `,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.gamesPlayed"
            ),
            value: `${friendlyFormattedNumber(
                gamesPlayed
            )} | #${friendlyFormattedNumber(
                relativeGamesPlayedRank
            )}/${friendlyFormattedNumber(totalPlayers)} `,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.firstPlayed"
            ),
            value: firstPlayDateString,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.lastActive"
            ),
            value: lastActiveDateString,
        },
        {
            inline: true,
            name: state.localizer.translate(
                guildID,
                "command.profile.timesVoted"
            ),
            value: friendlyFormattedNumber(timesVoted),
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
            inline: false,
            name: state.localizer.translate(guildID, "command.profile.badges"),
            value: badges,
        });
    }

    return fields;
}

export default class ProfileCommand implements BaseCommand {
    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.profile.help.description"
        ),
        examples: [
            {
                example: "`,profile`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.profile.help.example.self"
                ),
            },
            {
                example: "`,profile @FortnitePlayer`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.profile.help.example.otherPlayerMention",
                    {
                        playerName: "FortnitePlayer",
                    }
                ),
            },
            {
                example: "`,profile 141734249702096896`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.profile.help.example.otherPlayerID"
                ),
            },
        ],
        name: "profile",
        priority: 50,
        usage: `,profile { @${state.localizer.translate(
            guildID,
            "command.profile.help.usage.mention"
        )} }`,
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
                        description: state.localizer.translate(
                            message.guildID,
                            "command.profile.failure.notFound.description",
                            {
                                profileHelp: `\`${process.env.BOT_PREFIX}help profile\``,
                            }
                        ),
                        title: state.localizer.translate(
                            message.guildID,
                            "command.profile.failure.notFound.title"
                        ),
                    });
                    return;
                }
            }
        } else {
            sendErrorMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "command.profile.failure.notFound.badUsage.description",
                    { profileHelp: `\`${process.env.BOT_PREFIX}help profile\`` }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "command.profile.failure.notFound.title"
                ),
            });
            return;
        }

        const fields = await getProfileFields(requestedPlayer, message.guildID);

        if (fields.length === 0) {
            sendInfoMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.profile.noStats"
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "command.profile.failure.notFound.title"
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
            author: {
                avatarUrl: requestedPlayer.avatarURL,
                username: requestedPlayer.username,
            },
            fields,
            timestamp: new Date(),
            title: getUserTag(requestedPlayer),
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
                    fields,
                    timestamp: new Date(),
                    title: getUserTag(user),
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
