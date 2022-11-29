import { EMBED_SUCCESS_BONUS_COLOR, KmqImages } from "../../constants";
import { isUserPremium } from "../../helpers/game_utils";
import { sendInfoMessage } from "../../helpers/discord_utils";
import Eris from "eris";
import KmqConfiguration from "../../kmq_configuration";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import type { DefaultSlashCommand } from "../interfaces/base_command";
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
        description: LocalizationManager.translate(
            guildID,
            "command.premium.help.description"
        ),
        examples: [
            {
                example: "`,premium`",
                explanation: LocalizationManager.translate(
                    guildID,
                    "command.premium.help.example"
                ),
            },
        ],
        name: "premium",
        priority: 50,
        usage: ",premium",
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await PremiumCommand.sendPremiumMessage(
            MessageContext.fromMessage(message)
        );
    };

    static sendPremiumMessage = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> => {
        if (!KmqConfiguration.Instance.premiumCommandEnabled()) return;
        const premiumMember = await isUserPremium(messageContext.author.id);
        sendInfoMessage(
            messageContext,
            {
                color: premiumMember ? EMBED_SUCCESS_BONUS_COLOR : null,
                description: `${LocalizationManager.translate(
                    messageContext.guildID,
                    premiumMember
                        ? "command.premium.status.description.premium"
                        : "command.premium.status.description.nonPremium"
                )}\n\n${LocalizationManager.translate(
                    messageContext.guildID,
                    "command.premium.status.description.connectionReminder"
                )}`,
                fields: [
                    {
                        name: LocalizationManager.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.moreSongs.title"
                        ),
                        value: LocalizationManager.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.moreSongs.description"
                        ),
                    },
                    {
                        name: LocalizationManager.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.special.title"
                        ),
                        value: LocalizationManager.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.special.description"
                        ),
                    },
                    {
                        name: LocalizationManager.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.badge.title"
                        ),
                        value: LocalizationManager.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.badge.description"
                        ),
                    },
                ],
                thumbnailUrl: KmqImages.HAPPY,
                title: LocalizationManager.translate(
                    messageContext.guildID,
                    premiumMember
                        ? "command.premium.status.title.premium"
                        : "command.premium.status.title.nonPremium"
                ),
            },
            null,
            null,
            [],
            interaction
        );
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await PremiumCommand.sendPremiumMessage(messageContext, interaction);
    }
}
