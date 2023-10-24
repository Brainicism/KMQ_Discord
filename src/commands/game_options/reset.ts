import { GameOptionInternalToGameOption } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import _ from "lodash";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
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
        description: i18n.translate(guildID, "command.reset.help.description"),
        usage: "/reset",
        examples: [
            {
                example: "`/reset`",
                explanation: i18n.translate(
                    guildID,
                    "command.reset.help.example.reset",
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ResetCommand.updateOption(MessageContext.fromMessage(message));
    };

    static async updateOption(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const resetOptions = await guildPreference.resetToDefault();
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Reset to default guild preferences`,
        );

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            _.uniqBy(
                resetOptions.map((x) => ({
                    option: GameOptionInternalToGameOption[x] as GameOption,
                    reset: true,
                })),
                "option",
            ),
            false,
            true,
            undefined,
            interaction,
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await ResetCommand.updateOption(messageContext, interaction);
    }
}
