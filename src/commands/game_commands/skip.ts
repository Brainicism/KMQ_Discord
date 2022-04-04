import CommandPrechecks from "../../command_prechecks";
import { KmqImages } from "../../constants";
import {
    areUserAndBotInSameVoiceChannel,
    EMBED_SUCCESS_COLOR,
    getDebugLogHeader,
    getMajorityCount,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import GameSession from "../../structures/game_session";
import MessageContext from "../../structures/message_context";
import Round from "../../structures/round";
import { GameType, GuildTextableMessage } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("skip");

async function sendSkipNotification(
    message: GuildTextableMessage,
    round: Round
): Promise<void> {
    await sendInfoMessage(
        MessageContext.fromMessage(message),
        {
            description: state.localizer.translate(
                message.guildID,
                "command.skip.vote.description",
                {
                    skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                        message.guildID
                    )}`,
                }
            ),
            title: state.localizer.translate(
                message.guildID,
                "command.skip.vote.title"
            ),
        },
        true
    );
}

async function sendSkipMessage(
    message: GuildTextableMessage,
    round: Round
): Promise<void> {
    await sendInfoMessage(MessageContext.fromMessage(message), {
        color: EMBED_SUCCESS_COLOR,
        description: state.localizer.translate(
            message.guildID,
            "command.skip.success.description",
            {
                skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                    message.guildID
                )}`,
            }
        ),
        thumbnailUrl: KmqImages.NOT_IMPRESSED,
        title: state.localizer.translate(
            message.guildID,
            "command.skip.success.title"
        ),
    });
}

function isSkipMajority(
    message: GuildTextableMessage,
    gameSession: GameSession
): boolean {
    return gameSession.gameType === GameType.ELIMINATION
        ? gameSession.round.getSkipCount() >=
              Math.floor(
                  (
                      gameSession.scoreboard as EliminationScoreboard
                  ).getAlivePlayersCount() * 0.5
              ) +
                  1
        : gameSession.round.getSkipCount() >= getMajorityCount(message.guildID);
}

export default class SkipCommand implements BaseCommand {
    aliases = ["s"];
    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.skip.help.description"
        ),
        examples: [],
        name: "skip",
        priority: 1010,
        usage: ",skip",
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (
            !gameSession ||
            !gameSession.round ||
            gameSession.round.finished ||
            !areUserAndBotInSameVoiceChannel(message)
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid skip. !gameSession: ${!gameSession}. !gameSession.round: ${
                    gameSession && !gameSession.round
                }. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(
                    message
                )}`
            );
            return;
        }

        if (gameSession.gameType === GameType.ELIMINATION) {
            if (
                !(
                    gameSession.scoreboard as EliminationScoreboard
                ).isPlayerEliminated(message.author.id)
            ) {
                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | User skipped, elimination mode`
                );
                gameSession.round.userSkipped(message.author.id);
            }
        } else {
            gameSession.round.userSkipped(message.author.id);
            logger.info(`${getDebugLogHeader(message)} | User skipped`);
        }

        if (gameSession.round.skipAchieved) {
            // song already being skipped
            return;
        }

        if (isSkipMajority(message, gameSession)) {
            gameSession.round.skipAchieved = true;
            sendSkipMessage(message, gameSession.round);
            gameSession.endRound(
                guildPreference,
                MessageContext.fromMessage(message),
                { correct: false }
            );

            gameSession.startRound(
                guildPreference,
                MessageContext.fromMessage(message)
            );

            logger.info(
                `${getDebugLogHeader(message)} | Skip majority achieved.`
            );
        } else {
            logger.info(`${getDebugLogHeader(message)} | Skip vote received.`);
            await sendSkipNotification(message, gameSession.round);
        }

        gameSession.lastActiveNow();
    };
}
