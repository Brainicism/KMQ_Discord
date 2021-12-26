import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendInfoMessage,
    EMBED_SUCCESS_BONUS_COLOR,
} from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import dbContext from "../../database_context";
import { bold } from "../../helpers/utils";
import { userBonusIsActive } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("vote");

export const VOTE_BONUS_DURATION = 1;
const VOTE_RESET_DURATION = 12;

export const VOTE_LINK = "https://top.gg/bot/508759831755096074/vote";
export const REVIEW_LINK = "https://top.gg/bot/508759831755096074#reviews";

export default class VoteCommand implements BaseCommand {
    aliases = ["v", "voted"];

    help = (guildID: string) => ({
            name: "vote",
            description: state.localizer.translate(guildID,
                "Shows instructions on how to vote to receive 2x EXP for an hour."
            ),
            usage: ",vote",
            examples: [],
        });
    helpPriority = 60;

    call = async ({ message }: CommandArgs): Promise<void> => {
        let voteStatusString = "";
        const boostActive = await userBonusIsActive(message.author.id);
        const userVoterStatus = await dbContext
            .kmq("top_gg_user_votes")
            .where("user_id", "=", message.author.id)
            .first();

        if (boostActive) {
            const timeRemaining =
                new Date(
                    userVoterStatus["buff_expiry_date"] - Date.now()
                ).getTime() /
                (1000 * 60);

            voteStatusString = `${bold(
                state.localizer.translateN(message.guildID,
                    "%s minute",
                    Math.max(Math.ceil(timeRemaining), 0)
                )
            )} left.`;
        } else if (userVoterStatus) {
            // User has voted before
            const nextVoteTime = new Date(userVoterStatus["buff_expiry_date"]);
            nextVoteTime.setHours(
                nextVoteTime.getHours() +
                    VOTE_RESET_DURATION -
                    VOTE_BONUS_DURATION
            );
            if (nextVoteTime.getTime() <= Date.now()) {
                voteStatusString = state.localizer.translate(message.guildID, "You can vote now!");
            } else {
                const hoursLeft = Math.floor(
                    (nextVoteTime.getTime() - Date.now()) / (60 * 60 * 1000)
                );

                const minutesLeft = new Date(
                    nextVoteTime.getTime() - Date.now()
                ).getMinutes();

                if (hoursLeft === 0 && minutesLeft === 0) {
                    const secondsLeft = new Date(
                        nextVoteTime.getTime() - Date.now()
                    ).getSeconds();

                    voteStatusString = state.localizer.translateN(message.guildID,
                        "You can vote in **%s** second.",
                        secondsLeft
                    );
                } else {
                    voteStatusString = `${state.localizer.translate(message.guildID, "You can vote in")} ${
                        hoursLeft > 0
                            ? state.localizer.translateN(message.guildID, "**%s** hour and ", hoursLeft)
                            : ""
                    }${state.localizer.translateN(message.guildID, "**%s** minute.", minutesLeft)}.`;
                }
            }
        } else {
            voteStatusString = state.localizer.translate(message.guildID, "You can vote now!");
        }

        sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                color: boostActive ? EMBED_SUCCESS_BONUS_COLOR : null,
                title: boostActive
                    ? state.localizer.translate(message.guildID, "Boost Active!")
                    : state.localizer.translate(message.guildID, "Boost Inactive"),
                description: `${voteStatusString}\n\n${state.localizer.translate(message.guildID,
                    "Vote for KMQ on [top.gg]({{{voteLink}}}) and you'll receive 2x EXP for an hour! You can vote once every {{{voteResetDuration}}} hours.\n\nWe'd appreciate it if you could also leave a [review]({{{reviewLink}}}).",
                    {
                        voteLink: VOTE_LINK,
                        voteResetDuration: String(VOTE_RESET_DURATION),
                        reviewLink: REVIEW_LINK,
                    }
                )} `,
                thumbnailUrl: KmqImages.THUMBS_UP,
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                style: 5,
                                url: VOTE_LINK,
                                type: 2 as const,
                                emoji: { name: "✅" },
                                label: state.localizer.translate(message.guildID, "Vote!"),
                            },
                            {
                                style: 5,
                                url: REVIEW_LINK,
                                type: 2 as const,
                                emoji: { name: "📖" },
                                label: state.localizer.translate(message.guildID, "Leave a review!"),
                            },
                        ],
                    },
                ],
            },
            true
        );

        logger.info(
            `${getDebugLogHeader(message)} | Vote instructions retrieved.`
        );
    };
}
