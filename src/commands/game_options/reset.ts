import { GameOptionInternalToGameOption } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
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

    call = async ({ message }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        const resetOptions = await guildPreference.resetToDefault();
        logger.info(
            `${getDebugLogHeader(message)} | Reset to default guild preferences`
        );

        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            resetOptions.map((x) => ({
                option: GameOptionInternalToGameOption[x] as GameOption,
                reset: true,
            })),
            false,
            true
        );
    };
}
