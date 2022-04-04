import { KmqImages } from "../../constants";
import { sendInfoMessage } from "../../helpers/discord_utils";
import { isUserPremium } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

export default class PremiumCommand implements BaseCommand {
    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "commands.premium.help.description"
        ),
        examples: [
            {
                example: "`,premium`",
                explanation: state.localizer.translate(
                    guildID,
                    "commands.premium.help.example"
                ),
            },
        ],
        name: "premium",
        priority: 50,
        usage: ",premium",
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const premiumMember = await isUserPremium(message.author.id);
        sendInfoMessage(MessageContext.fromMessage(message), {
            description: `${state.localizer.translate(
                message.guildID,
                premiumMember
                    ? "commands.premium.description.premium"
                    : "commands.premium.description.nonPremium"
            )}\n\n${state.localizer.translate(
                message.guildID,
                "commands.premium.description.connectionReminder"
            )}`,
            fields: [
                {
                    name: state.localizer.translate(
                        message.guildID,
                        "commands.premium.perks.moreSongs.title"
                    ),
                    value: state.localizer.translate(
                        message.guildID,
                        "commands.premium.perks.moreSongs.description"
                    ),
                },
                {
                    name: state.localizer.translate(
                        message.guildID,
                        "commands.premium.perks.special.title"
                    ),
                    value: state.localizer.translate(
                        message.guildID,
                        "commands.premium.perks.special.description"
                    ),
                },
                {
                    name: state.localizer.translate(
                        message.guildID,
                        "commands.premium.perks.badge.title"
                    ),
                    value: state.localizer.translate(
                        message.guildID,
                        "commands.premium.perks.badge.description"
                    ),
                },
            ],
            thumbnailUrl: KmqImages.HAPPY,
            title: state.localizer.translate(
                message.guildID,
                premiumMember
                    ? "commands.premium.title.premium"
                    : "commands.premium.title.nonPremium"
            ),
        });
    };
}
