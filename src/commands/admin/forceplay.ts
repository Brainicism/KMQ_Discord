import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("forceplay");

// eslint-disable-next-line import/no-unused-modules
export default class ForcePlayCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.userAdminPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID,
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.FORCE_PLAY_SONG);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.FORCE_PLAY_SONG, reset: true }],
            );

            logger.info(
                `${getDebugLogHeader(message)} | Force play song reset.`,
            );
            return;
        }

        const forcePlaySongID = parsedMessage.components[0] as string;
        await guildPreference.setForcePlaySong(forcePlaySongID);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.FORCE_PLAY_SONG, reset: false }],
        );

        logger.info(
            `${getDebugLogHeader(message)} | Force play song set to ${
                guildPreference.gameOptions.forcePlaySongID
            }`,
        );
    };
}
