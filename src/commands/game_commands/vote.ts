import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import _logger from "../../logger";
import { getDebugLogHeader, sendInfoMessage, EMBED_SUCCESS_BONUS_COLOR, EMBED_INFO_COLOR } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import dbContext from "../../database_context";
import state from "../../kmq";
import { bold } from "../../helpers/utils";

const logger = _logger("vote");

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
        let timeRemainingString = "";
        const boostActive = state.bonusUsers.has(message.author.id);
        if (boostActive) {
            const userVoterStatus = await dbContext.kmq("top_gg_user_votes")
                .where("user_id", "=", message.author.id)
                .first();
            const timeRemaining = new Date(userVoterStatus["buff_expiry_date"] - Date.now()).getTime() / (1000 * 60);
            timeRemainingString = `${bold(String(Math.max(Math.ceil(timeRemaining), 0)))} minutes left.\n\n`;
        }
        sendInfoMessage(MessageContext.fromMessage(message), {
            color: boostActive ? EMBED_SUCCESS_BONUS_COLOR : EMBED_INFO_COLOR,
            title: boostActive ? "Boost active!" : "Boost inactive",
            description: `${timeRemainingString}Vote for KMQ on [top.gg](https://top.gg/bot/508759831755096074/vote) and you'll receive 2x EXP for an hour! You can vote once every 12 hours.\n\nWe'd appreciate it if you could also leave a [review](https://top.gg/bot/508759831755096074#reviews).`,
            thumbnailUrl: KmqImages.THUMBS_UP,
        }, true);
        logger.info(`${getDebugLogHeader(message)} | Vote instructions retrieved.`);
    };
}
