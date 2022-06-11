import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getUserVoiceChannel,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import { sendBeginGameSessionMessage } from "./play";
import CommandPrechecks from "../../command_prechecks";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameSession from "../../structures/game_session";
import type TeamScoreboard from "../../structures/team_scoreboard";

const logger = new IPCLogger("begin");

export default class BeginCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.maintenancePrecheck },
    ];

    static canStart(
        gameSession: GameSession,
        messageContext: MessageContext
    ): boolean {
        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            return false;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (teamScoreboard.getNumTeams() === 0) {
            sendErrorMessage(messageContext, {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.begin.ignored.title"
                ),
                description: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.begin.ignored.noTeam.description",
                    { join: `${process.env.BOT_PREFIX}join` }
                ),
            });
            return false;
        }

        return true;
    }

    call = async ({ message, channel }: CommandArgs): Promise<void> => {
        const { guildID } = message;
        const gameSession = Session.getSession(guildID) as GameSession;
        const messageContext = MessageContext.fromMessage(message);

        if (!BeginCommand.canStart(gameSession, messageContext)) return;
        const guildPreference = await GuildPreference.getGuildPreference(
            guildID
        );

        if (!gameSession.sessionInitialized) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            const participantIDs = teamScoreboard
                .getPlayers()
                .map((player) => player.id);

            sendBeginGameSessionMessage(
                channel.name,
                getUserVoiceChannel(messageContext).name,
                messageContext,
                participantIDs,
                guildPreference
            );

            gameSession.startRound(messageContext);

            logger.info(
                `${getDebugLogHeader(message)} | Teams game session starting)`
            );
        }
    };
}
