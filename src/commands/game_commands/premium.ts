import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import MessageContext from "../../structures/message_context";
import { isUserPremium } from "../../helpers/game_utils";
import { sendInfoMessage } from "../../helpers/discord_utils";
import { KmqImages } from "../../constants";

export default class PremiumCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = {
        name: "premium",
        description: "Find out more about KMQ premium including whether you're currently a member.",
        usage: ",premium",
        examples: [
            {
                example: "`,premium`",
                explanation: "Shows your premium status.",
            },
        ],
        priority: 50,
    };

    call = async ({ message }: CommandArgs) => {
        const premiumMember = await isUserPremium(message.author.id);
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: premiumMember ? "Thanks for supporting KMQ!" : "Subscribe to Premium KMQ!",
            description: `${premiumMember ? "You have [Premium KMQ](https://www.patreon.com/kmq)." : "Subscribe to [Premium KMQ](https://www.patreon.com/kmq) here."}\n\nMake sure to connect your Discord account [here](https://www.patreon.com/settings/apps) to receive your perks.`,
            fields: [
                {
                    name: "More songs!",
                    value: "Gain access to the top 25 b-sides songs per-artist (up from 10)",
                },
                {
                    name: "`,special` in every server!",
                    value: "Change song playback speed anywhere you play!",
                },
                {
                    name: "Premium Supporter Badge!",
                    value: "Show off your dedication to KMQ with an exclusive badge on your profile",
                },
            ],
            thumbnailUrl: KmqImages.HAPPY });
    };
}
