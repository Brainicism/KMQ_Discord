import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import { GameOptionInternalToGameOption } from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("reset");

export default class ResetCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [],
        maxArgCount: 0,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.reset.help.description"
        ),
        examples: [
            {
                example: "`,reset`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.reset.help.example.reset"
                ),
            },
        ],
        name: "reset",
        priority: 130,
        usage: ",reset",
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const resetOptions = await guildPreference.resetToDefault();
        logger.info(
            `${getDebugLogHeader(message)} | Reset to default guild preferences`
        );

        await sendOptionsMessage(
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
