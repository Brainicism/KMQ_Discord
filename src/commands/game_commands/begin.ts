import type BaseCommand from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendBeginGameSessionMessage } from "./play";
import { GameType } from "../../enums/game_type";
import type TeamScoreboard from "../../structures/team_scoreboard";
import {
    getDebugLogHeader,
    sendErrorMessage,
    getUserVoiceChannel,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import type GameSession from "../../structures/game_session";
import State from "../../state";
import CommandPrechecks from "../../command_prechecks";
import Session from "../../structures/session";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("begin");

export default class BeginCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
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
                title: State.localizer.translate(
                    messageContext.guildID,
                    "command.begin.ignored.title"
                ),
                description: State.localizer.translate(
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
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSession.sessionInitialized) {
            let participants: Array<{
                id: string;
                username: string;
                discriminator: string;
            }>;

            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            participants = teamScoreboard.getPlayers().map((player) => ({
                id: player.id,
                username: player.name.split("#")[0],
                discriminator: player.name.split("#")[1],
            }));

            sendBeginGameSessionMessage(
                channel.name,
                getUserVoiceChannel(messageContext).name,
                messageContext,
                participants,
                guildPreference
            );

            gameSession.startRound(guildPreference, messageContext);

            logger.info(
                `${getDebugLogHeader(message)} | Teams game session starting)`
            );
        }
    };
}
