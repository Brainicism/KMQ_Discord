import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { generateHint, validHintCheck } from "./hint";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getMention } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameSession from "src/structures/game_session";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    aliases = ["fhint", "fh"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "forcehint",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.forcehint.help.description"
        ),
        usage: ",forcehint",
        examples: [],
        priority: 1009,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const gameSession = Session.getSession(message.guildID) as GameSession;
        const gameRound = gameSession?.round;
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (
            !validHintCheck(
                gameSession,
                guildPreference,
                gameRound,
                MessageContext.fromMessage(message)
            )
        )
            return;
        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.forcehint.failure.notOwner.title"
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.forcehint.failure.notOwner.description",
                    { mentionedUser: getMention(gameSession.owner.id) }
                ),
            });
            return;
        }

        gameRound.hintRequested(message.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: LocalizationManager.localizer.translate(
                message.guildID,
                "command.hint.title"
            ),
            description: generateHint(
                message.guildID,
                guildPreference.gameOptions.guessModeType,
                gameRound
            ),
            thumbnailUrl: KmqImages.READING_BOOK,
        });
        logger.info(`${getDebugLogHeader(message)} | Owner force-hinted.`);
    };
}
