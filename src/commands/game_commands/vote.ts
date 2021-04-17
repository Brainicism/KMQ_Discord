import BaseCommand, { CommandArgs } from "../base_command";
import { userVoted } from "../../helpers/bot_stats_poster";
import _logger from "../../logger";
import { sendErrorMessage, sendInfoMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import state from "../../kmq";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";

const logger = _logger("vote");

export default class VoteCommand implements BaseCommand {
    aliases = ["v"];

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = {
        name: "vote",
        description: "",
        usage: "!vote",
        examples: [
            {
                example: "`!vote`",
                explanation: "",
            },
        ],
        priority: 210,
    };

    async call({ message }: CommandArgs) {
        const remainingCooldown = await userVoted(message.author.id);
        const messageContext = MessageContext.fromMessage(message);
        if (remainingCooldown === 0) {
            sendInfoMessage(messageContext, { title: "Bonus EXP activated!", description: "For the next hour, you'll receive 2x EXP! Thanks for voting!", thumbnailUrl: KmqImages.THUMBS_UP });
            state.bonusUsers[message.author.id] = new Date();
            logger.info(`${getDebugLogHeader(messageContext)} | User voted for KMQ`);
        } else {
            sendErrorMessage(messageContext, { title: "Ineligible for EXP bonus", description: `You can get bonus EXP in ${remainingCooldown} hours. Sit tight!`, thumbnailUrl: KmqImages.READING_BOOK });
            logger.info(`${getDebugLogHeader(messageContext)} | User attempted to vote for KMQ but ineligible`);
        }
    }
}

export async function clearExpiredBonusExpPlayers() {
    for (const [player, date] of Object.entries(state.bonusUsers)) {
        if (Date.now() - date.getTime() > 1000 * 60 * 60) {
            delete state.bonusUsers[player];
        }
    }
}
