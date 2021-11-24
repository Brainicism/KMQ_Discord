import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { GameOptionInternalToGameOption } from "../../structures/guild_preference";
import { GameOption } from "../../types";

const logger = new IPCLogger("reset");

export default class ResetCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = {
        name: "reset",
        description: "Reset to the default game options",
        usage: ",reset",
        examples: [
            {
                example: "`,reset`",
                explanation: "Resets to the default game options",
            },
        ],
        priority: 130,
    };

    call = async ({ message }: CommandArgs) : Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const resetOptions = await guildPreference.resetToDefault();
        logger.info(`${getDebugLogHeader(message)} | Reset to default guild preferences`);
        await sendOptionsMessage(MessageContext.fromMessage(message),
            guildPreference,
            resetOptions.map((x) => ({ option: GameOptionInternalToGameOption[x] as GameOption, reset: true })),
            false,
            true);
    };
}
