import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import GameSession from "../../structures/game_session";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    EMBED_SUCCESS_COLOR,
    sendInfoMessage,
    getMajorityCount,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import GameRound from "../../structures/game_round";
import { GuildTextableMessage, GameType } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("skip");

async function sendSkipNotification(
    message: GuildTextableMessage,
    gameRound: GameRound
): Promise<void> {
    await sendInfoMessage(
        MessageContext.fromMessage(message),
        {
            title: state.localizer.translate(
                message.guildID,
                "command.skip.vote.title"
            ),
            description: state.localizer.translate(
                message.guildID,
                "command.skip.vote.description",
                {
                    skipCounter: `${gameRound.getNumSkippers()}/${getMajorityCount(
                        message.guildID
                    )}`,
                }
            ),
        },
        true
    );
}

async function sendSkipMessage(
    message: GuildTextableMessage,
    gameRound: GameRound
): Promise<void> {
    await sendInfoMessage(MessageContext.fromMessage(message), {
        color: EMBED_SUCCESS_COLOR,
        title: state.localizer.translate(
            message.guildID,
            "command.skip.success.title"
        ),
        description: state.localizer.translate(
            message.guildID,
            "command.skip.success.description",
            {
                skipCounter: `${gameRound.getNumSkippers()}/${getMajorityCount(
                    message.guildID
                )}`,
            }
        ),
        thumbnailUrl: KmqImages.NOT_IMPRESSED,
    });
}

function isSkipMajority(
    message: GuildTextableMessage,
    gameSession: GameSession
): boolean {
    return gameSession.gameType === GameType.ELIMINATION
        ? gameSession.gameRound.getNumSkippers() >=
              Math.floor(
                  (
                      gameSession.scoreboard as EliminationScoreboard
                  ).getAlivePlayersCount() * 0.5
              ) +
                  1
        : gameSession.gameRound.getNumSkippers() >=
              getMajorityCount(message.guildID);
}

export default class SkipCommand implements BaseCommand {
    aliases = ["s"];
    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        name: "skip",
        description: state.localizer.translate(
            guildID,
            "command.skip.help.description"
        ),
        usage: ",skip",
        examples: [],
        priority: 1010,
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (
            !gameSession ||
            !gameSession.gameRound ||
            gameSession.gameRound.finished ||
            !areUserAndBotInSameVoiceChannel(message)
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${
                    gameSession && !gameSession.gameRound
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
                gameSession.gameRound.userSkipped(message.author.id);
            }
        } else {
            gameSession.gameRound.userSkipped(message.author.id);
            logger.info(`${getDebugLogHeader(message)} | User skipped`);
        }

        if (gameSession.gameRound.skipAchieved) {
            // song already being skipped
            return;
        }

        if (isSkipMajority(message, gameSession)) {
            gameSession.gameRound.skipAchieved = true;
            sendSkipMessage(message, gameSession.gameRound);
            gameSession.endRound(
                { correct: false },
                guildPreference,
                MessageContext.fromMessage(message)
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
            await sendSkipNotification(message, gameSession.gameRound);
        }

        gameSession.lastActiveNow();
    };
}
