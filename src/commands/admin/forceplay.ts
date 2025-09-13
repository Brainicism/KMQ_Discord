import { IPCLogger } from "../../logger.js";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import GameOption from "../../enums/game_option_name.js";
import GuildPreference from "../../structures/guild_preference.js";
import MessageContext from "../../structures/message_context.js";
import Session from "../../structures/session.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";

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
