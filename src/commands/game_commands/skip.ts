import { EMBED_SUCCESS_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    getMajorityCount,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GameType from "../../enums/game_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EliminationScoreboard from "../../structures/elimination_scoreboard";
import type HelpDocumentation from "../../interfaces/help";
import type Round from "../../structures/round";

const logger = new IPCLogger("skip");

async function sendSkipNotification(
    message: GuildTextableMessage,
    round: Round
): Promise<void> {
    await sendInfoMessage(
        MessageContext.fromMessage(message),
        {
            title: LocalizationManager.localizer.translate(
                message.guildID,
                "command.skip.vote.title"
            ),
            description: LocalizationManager.localizer.translate(
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
        title: LocalizationManager.localizer.translate(
            message.guildID,
            "misc.skip"
        ),
        description: LocalizationManager.localizer.translate(
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

/**
 * Whether there are enough votes to skip the song
 * @param guildID - The guild's ID
 * @param session - The current session
 * @returns whether the song has enough votes to be skipped
 */
export function isSkipMajority(guildID: string, session: Session): boolean {
    if (session.isGameSession()) {
        if (session.gameType === GameType.ELIMINATION) {
            return (
                session.round.getSkipCount() >=
                Math.floor(
                    (
                        session.scoreboard as EliminationScoreboard
                    ).getAlivePlayersCount() * 0.5
                ) +
                    1
            );
        }
    }

    return session.round.getSkipCount() >= getMajorityCount(guildID);
}

/**
 * Skip the current song (end the current round and start a new one)
 * @param messageContext - The context that triggered skipping
 * @param session - The current session
 */
export async function skipSong(
    messageContext: MessageContext,
    session: Session
): Promise<void> {
    logger.info(
        `${getDebugLogHeader(messageContext)} | Skip majority achieved.`
    );
    session.round.skipAchieved = true;
    await session.endRound(messageContext, { correct: false });

    session.startRound(messageContext);
}

export default class SkipCommand implements BaseCommand {
    aliases = ["s"];
    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "skip",
        description: LocalizationManager.localizer.translate(
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
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            return;
        }

        if (session.isGameSession()) {
            if (session.gameType === GameType.ELIMINATION) {
                if (
                    !(
                        session.scoreboard as EliminationScoreboard
                    ).isPlayerEliminated(message.author.id)
                ) {
                    logger.info(
                        `${getDebugLogHeader(
                            message
                        )} | User skipped, elimination mode`
                    );
                    session.round.userSkipped(message.author.id);
                }
            }
        }

        session.round.userSkipped(message.author.id);
        logger.info(`${getDebugLogHeader(message)} | User skipped`);

        if (isSkipMajority(message.guildID, session)) {
            sendSkipMessage(message, session.round);
            skipSong(MessageContext.fromMessage(message), session);
        } else {
            logger.info(`${getDebugLogHeader(message)} | Skip vote received.`);
            await sendSkipNotification(message, session.round);
        }

        session.lastActiveNow();
    };
}
