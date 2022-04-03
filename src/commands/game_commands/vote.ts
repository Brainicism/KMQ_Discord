import { KmqImages } from "../../constants";
import dbContext from "../../database_context";
import {
    EMBED_SUCCESS_BONUS_COLOR,
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { userBonusIsActive } from "../../helpers/game_utils";
import { bold } from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("vote");

export const VOTE_BONUS_DURATION = 1;
const VOTE_RESET_DURATION = 12;

export const VOTE_LINK = "https://top.gg/bot/508759831755096074/vote";
export const REVIEW_LINK = "https://top.gg/bot/508759831755096074#reviews";

export default class VoteCommand implements BaseCommand {
    aliases = ["v", "voted"];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.vote.help.description"
        ),
        examples: [],
        name: "vote",
        priority: 60,
        usage: ",vote",
    });

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

            voteStatusString = state.localizer.translate(
                message.guildID,
                "command.vote.timeLeft",
                {
                    time: bold(
                        state.localizer.translateN(
                            message.guildID,
                            "misc.plural.minute",
                            Math.max(Math.ceil(timeRemaining), 0)
                        )
                    ),
                }
            );
        } else if (userVoterStatus) {
            // User has voted before
            const nextVoteTime = new Date(userVoterStatus["buff_expiry_date"]);
            nextVoteTime.setHours(
                nextVoteTime.getHours() +
                    VOTE_RESET_DURATION -
                    VOTE_BONUS_DURATION
            );
            if (nextVoteTime.getTime() <= Date.now()) {
                voteStatusString = state.localizer.translate(
                    message.guildID,
                    "command.vote.available"
                );
            } else {
                const hoursLeft = Math.floor(
                    (nextVoteTime.getTime() - Date.now()) / (60 * 60 * 1000)
                );

                const minutesLeft = new Date(
                    nextVoteTime.getTime() - Date.now()
                ).getMinutes();

                const secondsLeft = new Date(
                    nextVoteTime.getTime() - Date.now()
                ).getSeconds();

                if (hoursLeft > 0) {
                    voteStatusString = state.localizer.translate(
                        message.guildID,
                        "command.vote.unavailable.hours",
                        {
                            hours: state.localizer.translateN(
                                message.guildID,
                                "misc.plural.hour",
                                hoursLeft
                            ),
                        }
                    );
                } else if (minutesLeft > 0) {
                    voteStatusString = state.localizer.translate(
                        message.guildID,
                        "command.vote.unavailable.minutes",
                        {
                            minutes: state.localizer.translateN(
                                message.guildID,
                                "misc.plural.minute",
                                minutesLeft
                            ),
                        }
                    );
                } else {
                    voteStatusString = state.localizer.translate(
                        message.guildID,
                        "command.vote.unavailable.seconds",
                        {
                            seconds: state.localizer.translateN(
                                message.guildID,
                                "misc.plural.second",
                                secondsLeft
                            ),
                        }
                    );
                }
            }
        } else {
            voteStatusString = state.localizer.translate(
                message.guildID,
                "command.vote.available"
            );
        }

        sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                color: boostActive ? EMBED_SUCCESS_BONUS_COLOR : null,
                components: [
                    {
                        components: [
                            {
                                emoji: { name: "✅" },
                                label: state.localizer.translate(
                                    message.guildID,
                                    "misc.interaction.vote"
                                ),
                                style: 5,
                                type: 2 as const,
                                url: VOTE_LINK,
                            },
                            {
                                emoji: { name: "📖" },
                                label: state.localizer.translate(
                                    message.guildID,
                                    "misc.interaction.leaveReview"
                                ),
                                style: 5,
                                type: 2 as const,
                                url: REVIEW_LINK,
                            },
                        ],
                        type: 1,
                    },
                ],
                description: `${voteStatusString}\n\n${state.localizer.translate(
                    message.guildID,
                    "command.vote.description",
                    {
                        reviewLink: REVIEW_LINK,
                        voteLink: VOTE_LINK,
                        voteResetDuration: String(VOTE_RESET_DURATION),
                    }
                )} `,
                thumbnailUrl: KmqImages.THUMBS_UP,
                title: boostActive
                    ? state.localizer.translate(
                          message.guildID,
                          "command.vote.boost.active"
                      )
                    : state.localizer.translate(
                          message.guildID,
                          "command.vote.boost.inactive"
                      ),
            },
            true
        );

        logger.info(
            `${getDebugLogHeader(message)} | Vote instructions retrieved.`
        );
    };
}
