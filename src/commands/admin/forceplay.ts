import BaseCommand from "../interfaces/base_command";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { getGuildPreference } from "../../helpers/game_utils";
import { GameOption } from "../../enums/game_option_name";
import CommandPrechecks from "../../command_prechecks";
import CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("forceplay");

export default class ForcePlayCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.FORCE_PLAY_SONG);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.FORCE_PLAY_SONG, reset: true }]
            );

            logger.info(
                `${getDebugLogHeader(message)} | Force play song reset.`
            );
            return;
        }

        const forcePlaySongID = parsedMessage.components[0];
        await guildPreference.setForcePlaySong(forcePlaySongID);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.FORCE_PLAY_SONG, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Force play song set to ${
                guildPreference.gameOptions.forcePlaySongID
            }`
        );
    };
}
