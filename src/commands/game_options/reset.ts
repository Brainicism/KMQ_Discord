import { GameOptionInternalToGameOption } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    sendOptionsMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameOption from "../../enums/game_option_name";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("reset");

export default class ResetCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "reset",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.reset.help.description"
        ),
        usage: ",reset",
        examples: [
            {
                example: "`,reset`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.reset.help.example.reset"
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "reset",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.reset.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ResetCommand.updateOption(MessageContext.fromMessage(message));
    };

    static async updateOption(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const resetOptions = await guildPreference.resetToDefault();
        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Reset to default guild preferences`
        );

        if (interaction) {
            const embedPayload = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                resetOptions.map((x) => ({
                    option: GameOptionInternalToGameOption[x] as GameOption,
                    reset: true,
                })),
                false,
                true
            );

            await tryCreateInteractionCustomPayloadAcknowledgement(
                messageContext,
                interaction,
                embedPayload
            );
        } else {
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                resetOptions.map((x) => ({
                    option: GameOptionInternalToGameOption[x] as GameOption,
                    reset: true,
                })),
                false,
                true
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await ResetCommand.updateOption(messageContext, interaction);
    }
}
