import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getDebugLogHeader, sendInfoMessage, EMBED_SUCCESS_BONUS_COLOR, EMBED_INFO_COLOR } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import dbContext from "../../database_context";
import { bold } from "../../helpers/utils";
import { userBonusIsActive } from "../../helpers/game_utils";

const logger = new IPCLogger("vote");

export const VOTE_BONUS_DURATION = 1;
const VOTE_RESET_DURATION = 12;

export default class VoteCommand implements BaseCommand {
    aliases = ["v", "voted"];

    help = {
        name: "vote",
        description: "Shows instructions on how to vote to receive 2x EXP for an hour.",
        usage: ",vote",
        examples: [],
        priority: 60,
    };

    call = async ({ message }: CommandArgs) => {
        let voteStatusString = "";
        const boostActive = await userBonusIsActive(message.author.id);
        const userVoterStatus = await dbContext.kmq("top_gg_user_votes")
            .where("user_id", "=", message.author.id)
            .first();

        if (boostActive) {
            const timeRemaining = new Date(userVoterStatus["buff_expiry_date"] - Date.now()).getTime() / (1000 * 60);
            voteStatusString = `${bold(String(Math.max(Math.ceil(timeRemaining), 0)))} minute${timeRemaining > 1 ? "s" : ""} left.`;
        } else if (userVoterStatus) {
            // User has voted before
            const nextVoteTime = new Date(userVoterStatus["buff_expiry_date"]);
            nextVoteTime.setHours(nextVoteTime.getHours() + VOTE_RESET_DURATION - VOTE_BONUS_DURATION);
            if (nextVoteTime.getTime() <= Date.now()) {
                voteStatusString = "You can vote now!";
            } else {
                const hoursLeft = Math.floor((nextVoteTime.getTime() - Date.now()) / (60 * 60 * 1000));
                const minutesLeft = new Date(nextVoteTime.getTime() - Date.now()).getMinutes();
                if (hoursLeft === 0 && minutesLeft === 0) {
                    const secondsLeft = new Date(nextVoteTime.getTime() - Date.now()).getSeconds();
                    voteStatusString = `You can vote in ${bold(String(secondsLeft))} seconds.`;
                } else {
                    voteStatusString = `You can vote in ${hoursLeft > 0 ? `${bold(String(hoursLeft))} hours and ` : ""} ${bold(String(minutesLeft))} minutes.`;
                }
            }
        } else {
            voteStatusString = "You can vote now!";
        }

        sendInfoMessage(MessageContext.fromMessage(message), {
            color: boostActive ? EMBED_SUCCESS_BONUS_COLOR : EMBED_INFO_COLOR,
            title: boostActive ? "Boost active!" : "Boost inactive",
            description: `${voteStatusString}\n\nVote for KMQ on [top.gg](https://top.gg/bot/508759831755096074/vote) and you'll receive 2x EXP for an hour! You can vote once every ${VOTE_RESET_DURATION} hours.\n\nWe'd appreciate it if you could also leave a [review](https://top.gg/bot/508759831755096074#reviews).`,
            thumbnailUrl: KmqImages.THUMBS_UP,
            components: [
                {
                    type: 1,
                    components: [
                        { style: 5, url: "https://top.gg/bot/508759831755096074/vote", type: 2 as const, emoji: { name: "✅" }, label: "Vote!" },
                        { style: 5, url: "https://top.gg/bot/508759831755096074/vote", type: 2 as const, emoji: { name: "📖" }, label: "Leave a review!" }],
                },
            ],
        }, true);
        logger.info(`${getDebugLogHeader(message)} | Vote instructions retrieved.`);
    };
}
