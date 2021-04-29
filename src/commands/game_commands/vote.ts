import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getDebugLogHeader, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";

const logger = _logger("vote");

export default class VoteCommand implements BaseCommand {
    aliases = ["v", "voted"];

    help = {
        name: "vote",
        description: "Shows instructions on how to vote to receive 2x EXP for an hour.",
        usage: "!vote",
        examples: [],
        priority: 210,
    };

    async call({ message }: CommandArgs) {
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Help KMQ grow!", description: "Vote for KMQ on [top.gg](https://top.gg/bot/508759831755096074/vote) and you'll receive 2x EXP for an hour! You can vote once every 12 hours.\n\nWe'd appreciate it if you could also leave a [review](https://top.gg/bot/508759831755096074#reviews).", thumbnailUrl: KmqImages.THUMBS_UP });
        logger.info(`${getDebugLogHeader(message)} | Vote instructions retrieved.`);
    }
}
