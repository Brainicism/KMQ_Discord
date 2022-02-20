import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import MessageContext from "../../structures/message_context";
import { isUserPremium } from "../../helpers/game_utils";
import { sendInfoMessage } from "../../helpers/discord_utils";
import { state } from "../../kmq_worker";
import { KmqImages } from "../../constants";

export default class PremiumCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = (guildID: string): Help => ({
        name: "premium",
        description: state.localizer.translate(
            guildID,
            "commands.premium.help.description"
        ),
        usage: ",premium",
        examples: [
            {
                example: "`,premium`",
                explanation: state.localizer.translate(
                    guildID,
                    "commands.premium.help.example"
                ),
            },
        ],
        priority: 50,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const premiumMember = await isUserPremium(message.author.id);
        sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                premiumMember
                    ? "commands.premium.title.premium"
                    : "commands.premium.title.nonPremium"
            ),
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
        });
    };
}
