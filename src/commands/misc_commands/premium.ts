import { EMBED_SUCCESS_BONUS_COLOR, KmqImages } from "../../constants";
import { clickableSlashCommand } from "../../helpers/utils";
import { isUserPremium } from "../../helpers/game_utils";
import { sendInfoMessage } from "../../helpers/discord_utils";
import Eris from "eris";
import KmqConfiguration from "../../kmq_configuration";
import MessageContext from "../../structures/message_context";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "premium";

export default class PremiumCommand implements BaseCommand {
    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.premium.help.description",
        ),
        examples: [
            {
                example: clickableSlashCommand(COMMAND_NAME),
                explanation: i18n.translate(
                    guildID,
                    "command.premium.help.example",
                ),
            },
        ],
        priority: 50,
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
            MessageContext.fromMessage(message),
        );
    };

    static sendPremiumMessage = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        if (!KmqConfiguration.Instance.premiumCommandEnabled()) return;
        const premiumMember = await isUserPremium(messageContext.author.id);
        sendInfoMessage(
            messageContext,
            {
                color: premiumMember ? EMBED_SUCCESS_BONUS_COLOR : undefined,
                description: `${i18n.translate(
                    messageContext.guildID,
                    premiumMember
                        ? "command.premium.status.description.premium"
                        : "command.premium.status.description.nonPremium",
                )}\n\n${i18n.translate(
                    messageContext.guildID,
                    "command.premium.status.description.connectionReminder",
                )}`,
                fields: [
                    {
                        name: i18n.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.moreSongs.title",
                        ),
                        value: i18n.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.moreSongs.description",
                        ),
                    },
                    {
                        name: i18n.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.special.title",
                        ),
                        value: i18n.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.special.description",
                        ),
                    },
                    {
                        name: i18n.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.badge.title",
                        ),
                        value: i18n.translate(
                            messageContext.guildID,
                            "command.premium.status.perks.badge.description",
                        ),
                    },
                ],
                thumbnailUrl: KmqImages.HAPPY,
                title: i18n.translate(
                    messageContext.guildID,
                    premiumMember
                        ? "command.premium.status.title.premium"
                        : "command.premium.status.title.nonPremium",
                ),
            },
            false,
            undefined,
            [],
            interaction,
        );
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await PremiumCommand.sendPremiumMessage(messageContext, interaction);
    }
}
