import type BaseCommand from "../interfaces/base_command";
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
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocalizationManager from "../../helpers/localization_manager";

const logger = new IPCLogger("vote");

export const VOTE_BONUS_DURATION = 1;
const VOTE_RESET_DURATION = 12;

export const VOTE_LINK = "https://top.gg/bot/508759831755096074/vote";
export const REVIEW_LINK = "https://top.gg/bot/508759831755096074#reviews";

export default class VoteCommand implements BaseCommand {
    aliases = ["v", "voted"];

    help = (guildID: string): HelpDocumentation => ({
        name: "vote",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.vote.help.description"
        ),
        usage: ",vote",
        examples: [],
        priority: 60,
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

            voteStatusString = LocalizationManager.localizer.translate(
                message.guildID,
                "command.vote.timeLeft",
                {
                    time: bold(
                        LocalizationManager.localizer.translateN(
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
                voteStatusString = LocalizationManager.localizer.translate(
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
                    voteStatusString = LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.vote.unavailable.hours",
                        {
                            hours: LocalizationManager.localizer.translateN(
                                message.guildID,
                                "misc.plural.hour",
                                hoursLeft
                            ),
                        }
                    );
                } else if (minutesLeft > 0) {
                    voteStatusString = LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.vote.unavailable.minutes",
                        {
                            minutes: LocalizationManager.localizer.translateN(
                                message.guildID,
                                "misc.plural.minute",
                                minutesLeft
                            ),
                        }
                    );
                } else {
                    voteStatusString = LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.vote.unavailable.seconds",
                        {
                            seconds: LocalizationManager.localizer.translateN(
                                message.guildID,
                                "misc.plural.second",
                                secondsLeft
                            ),
                        }
                    );
                }
            }
        } else {
            voteStatusString = LocalizationManager.localizer.translate(
                message.guildID,
                "command.vote.available"
            );
        }

        sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                color: boostActive ? EMBED_SUCCESS_BONUS_COLOR : null,
                title: boostActive
                    ? LocalizationManager.localizer.translate(
                          message.guildID,
                          "command.vote.boost.active"
                      )
                    : LocalizationManager.localizer.translate(
                          message.guildID,
                          "command.vote.boost.inactive"
                      ),
                description: `${voteStatusString}\n\n${LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.vote.description",
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
                                label: LocalizationManager.localizer.translate(
                                    message.guildID,
                                    "misc.interaction.vote"
                                ),
                            },
                            {
                                style: 5,
                                url: REVIEW_LINK,
                                type: 2 as const,
                                emoji: { name: "📖" },
                                label: LocalizationManager.localizer.translate(
                                    message.guildID,
                                    "misc.interaction.leaveReview"
                                ),
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
