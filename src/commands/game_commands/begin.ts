import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { sendBeginGameMessage } from "./play";
import { GameType } from "../../types";
import TeamScoreboard from "../../structures/team_scoreboard";
import {
    getDebugLogHeader,
    sendErrorMessage,
    getUserVoiceChannel,
    getMention,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import GameSession from "../../structures/game_session";
import { state } from "../../kmq_worker";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("begin");

export default class BeginCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    static canStart(
        gameSession: GameSession,
        authorID: string,
        messageContext: MessageContext
    ): boolean {
        if (
            !gameSession ||
            (gameSession.gameType !== GameType.ELIMINATION &&
                gameSession.gameType !== GameType.TEAMS)
        ) {
            return false;
        }

        if (gameSession.gameType === GameType.ELIMINATION) {
            if (gameSession.owner.id !== authorID) {
                sendErrorMessage(messageContext, {
                    title: state.localizer.translate(
                        messageContext.guildID,
                        "command.begin.ignored.title"
                    ),
                    description: state.localizer.translate(
                        messageContext.guildID,
                        "command.begin.ignored.notOwner.description",
                        {
                            playElimination: `\`${process.env.BOT_PREFIX}play elimination\``,
                            mentionedUser: getMention(gameSession.owner.id),
                        }
                    ),
                });
                return false;
            }
        } else if (gameSession.gameType === GameType.TEAMS) {
            const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
            if (teamScoreboard.getNumTeams() === 0) {
                sendErrorMessage(messageContext, {
                    title: state.localizer.translate(
                        messageContext.guildID,
                        "command.begin.ignored.title"
                    ),
                    description: state.localizer.translate(
                        messageContext.guildID,
                        "command.begin.ignored.noTeam.description",
                        { join: `${process.env.BOT_PREFIX}join` }
                    ),
                });
                return false;
            }
        }

        return true;
    }

    call = async ({
        message,
        gameSessions,
        channel,
    }: CommandArgs): Promise<void> => {
        const { guildID, author } = message;
        const gameSession = gameSessions[guildID];

        if (
            !BeginCommand.canStart(
                gameSession,
                author.id,
                MessageContext.fromMessage(message)
            )
        )
            return;
        const guildPreference = await getGuildPreference(guildID);
        if (!gameSession.sessionInitialized) {
            let participants: Array<{
                id: string;
                username: string;
                discriminator: string;
            }>;

            if (gameSession.gameType === GameType.ELIMINATION) {
                participants = [...gameSession.participants].map((x) =>
                    state.client.users.get(x)
                );
            } else if (gameSession.gameType === GameType.TEAMS) {
                const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
                participants = teamScoreboard.getPlayers().map((player) => ({
                    id: player.id,
                    username: player.name.split("#")[0],
                    discriminator: player.name.split("#")[1],
                }));
            }

            sendBeginGameMessage(
                channel.name,
                getUserVoiceChannel(MessageContext.fromMessage(message)).name,
                message,
                participants
            );

            gameSession.startRound(
                guildPreference,
                MessageContext.fromMessage(message)
            );

            logger.info(
                `${getDebugLogHeader(message)} | Game session starting (${
                    gameSession.gameType
                } gameType)`
            );
        }
    };
}
