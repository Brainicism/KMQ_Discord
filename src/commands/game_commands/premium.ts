import { KmqImages } from "../../constants";
import { isUserPremium } from "../../helpers/game_utils";
import { sendInfoMessage } from "../../helpers/discord_utils";
import KmqConfiguration from "../../kmq_configuration";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

export default class PremiumCommand implements BaseCommand {
    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): HelpDocumentation => ({
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.premium.help.description"
        ),
        examples: [
            {
                example: "`,premium`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.premium.help.example"
                ),
            },
        ],
        name: "premium",
        priority: 50,
        usage: ",premium",
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        if (!KmqConfiguration.Instance.premiumCommandEnabled()) return;
        const premiumMember = await isUserPremium(message.author.id);
        sendInfoMessage(MessageContext.fromMessage(message), {
            description: `${LocalizationManager.localizer.translate(
                message.guildID,
                premiumMember
                    ? "command.premium.status.description.premium"
                    : "command.premium.status.description.nonPremium"
            )}\n\n${LocalizationManager.localizer.translate(
                message.guildID,
                "command.premium.status.description.connectionReminder"
            )}`,
            fields: [
                {
                    name: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.status.perks.moreSongs.title"
                    ),
                    value: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.status.perks.moreSongs.description"
                    ),
                },
                {
                    name: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.status.perks.special.title"
                    ),
                    value: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.status.perks.special.description"
                    ),
                },
                {
                    name: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.status.perks.badge.title"
                    ),
                    value: LocalizationManager.localizer.translate(
                        message.guildID,
                        "command.premium.status.perks.badge.description"
                    ),
                },
            ],
            thumbnailUrl: KmqImages.HAPPY,
            title: LocalizationManager.localizer.translate(
                message.guildID,
                premiumMember
                    ? "command.premium.status.title.premium"
                    : "command.premium.status.title.nonPremium"
            ),
        });
    };
}
