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
import { GuildTextableMessage, GameType } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import EliminationScoreboard from "../../structures/elimination_scoreboard";
import { state } from "../../kmq_worker";
import Round from "../../structures/round";
import Session from "../../structures/session";

const logger = new IPCLogger("skip");

async function sendSkipNotification(
    message: GuildTextableMessage,
    round: Round
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
                    skipCounter: `${round.getSkipCount()}/${getMajorityCount(
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
    round: Round
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
                skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                    message.guildID
                )}`,
            }
        ),
        thumbnailUrl: KmqImages.NOT_IMPRESSED,
    });
}

function isSkipMajority(
    message: GuildTextableMessage,
    session: Session
): boolean {
    if (session instanceof GameSession) {
        const gameSession = session as GameSession;
        if (gameSession.gameType === GameType.ELIMINATION) {
            return (
                gameSession.round.getSkipCount() >=
                Math.floor(
                    (
                        gameSession.scoreboard as EliminationScoreboard
                    ).getAlivePlayersCount() * 0.5
                ) +
                    1
            );
        }
    }

    return session.round.getSkipCount() >= getMajorityCount(message.guildID);
}

export default class SkipCommand implements BaseCommand {
    aliases = ["s"];
    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
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

    call = async ({ message }: CommandArgs): Promise<void> => {
        if (!areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid skip. User and bot are not in the same voice channel.`
            );
            return;
        }

        const session = Session.getSession(message.guildID);
        if (
            !session ||
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            return;
        }

        if (session instanceof GameSession) {
            const gameSession = session as GameSession;
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
            }
        }

        session.round.userSkipped(message.author.id);
        logger.info(`${getDebugLogHeader(message)} | User skipped`);

        const guildPreference = await getGuildPreference(message.guildID);
        if (isSkipMajority(message, session)) {
            session.round.skipAchieved = true;
            sendSkipMessage(message, session.round);
            await session.endRound(
                guildPreference,
                MessageContext.fromMessage(message),
                { correct: false }
            );

            session.startRound(
                guildPreference,
                MessageContext.fromMessage(message)
            );

            logger.info(
                `${getDebugLogHeader(message)} | Skip majority achieved.`
            );
        } else {
            logger.info(`${getDebugLogHeader(message)} | Skip vote received.`);
            await sendSkipNotification(message, session.round);
        }

        session.lastActiveNow();
    };
}
