import { EMBED_SUCCESS_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    getMajorityCount,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameType from "../../enums/game_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EliminationScoreboard from "../../structures/elimination_scoreboard";
import type HelpDocumentation from "../../interfaces/help";
import type Round from "../../structures/round";

const COMMAND_NAME = "skip";
const logger = new IPCLogger(COMMAND_NAME);

async function sendSkipNotification(
    messageContext: MessageContext,
    round: Round,
    interaction?: Eris.CommandInteraction,
): Promise<void> {
    const embedPayload = {
        title: i18n.translate(
            messageContext.guildID,
            "command.skip.vote.title",
        ),
        description: i18n.translate(
            messageContext.guildID,
            "command.skip.vote.description",
            {
                skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                    messageContext.guildID,
                )}`,
            },
        ),
    };

    await sendInfoMessage(
        messageContext,
        embedPayload,
        true,
        undefined,
        [],
        interaction,
    );

    logger.info(
        `${getDebugLogHeader(messageContext)} | Vote instructions retrieved.`,
    );
}

async function sendSkipMessage(
    messageContext: MessageContext,
    round: Round,
    interaction?: Eris.CommandInteraction,
): Promise<void> {
    const embedPayload = {
        color: EMBED_SUCCESS_COLOR,
        title: i18n.translate(messageContext.guildID, "misc.skip"),
        description: i18n.translate(
            messageContext.guildID,
            "command.skip.success.description",
            {
                skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                    messageContext.guildID,
                )}`,
            },
        ),
        thumbnailUrl: KmqImages.NOT_IMPRESSED,
    };

    await sendInfoMessage(
        messageContext,
        embedPayload,
        false,
        undefined,
        [],
        interaction,
    );
}

/**
 * Whether there are enough votes to skip the song
 * @param guildID - The guild's ID
 * @param session - The current session
 * @returns whether the song has enough votes to be skipped
 */
export function isSkipMajority(guildID: string, session: Session): boolean {
    if (!session.round) {
        return false;
    }

    if (session.isGameSession()) {
        if (session.gameType === GameType.ELIMINATION) {
            return (
                session.round.getSkipCount() >=
                Math.floor(
                    (
                        session.scoreboard as EliminationScoreboard
                    ).getAlivePlayersCount() * 0.5,
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
    session: Session,
): Promise<void> {
    logger.info(
        `${getDebugLogHeader(messageContext)} | Skip majority achieved.`,
    );

    if (!session.round) {
        return;
    }

    session.round.skipAchieved = true;
    await session.endRound(messageContext, { correct: false });
    await session.startRound(messageContext);
}

export default class SkipCommand implements BaseCommand {
    aliases = ["s"];
    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSuddenDeathPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.skip.help.description"),
        examples: [],
        priority: 1010,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await SkipCommand.executeSkip(MessageContext.fromMessage(message));
    };

    static async executeSkip(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const session = Session.getSession(messageContext.guildID);

        if (
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.round.noneInProgress.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.round.noneInProgress.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction,
            );
            return;
        }

        if (
            !areUserAndBotInSameVoiceChannel(
                messageContext.author.id,
                messageContext.guildID,
            )
        ) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.skip.failure.skipIgnored",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.preCheck.differentVC",
                    ),
                },
                interaction,
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Invalid skip. User and bot are not in the same voice channel.`,
            );
            return;
        }

        if (session.isGameSession()) {
            if (session.gameType === GameType.ELIMINATION) {
                if (
                    !(
                        session.scoreboard as EliminationScoreboard
                    ).isPlayerEliminated(messageContext.author.id)
                ) {
                    logger.info(
                        `${getDebugLogHeader(
                            messageContext,
                        )} | User skipped, elimination mode`,
                    );
                    session.round.userSkipped(messageContext.author.id);
                }
            }
        }

        session.round.userSkipped(messageContext.author.id);
        logger.info(`${getDebugLogHeader(messageContext)} | User skipped`);

        if (isSkipMajority(messageContext.guildID, session)) {
            sendSkipMessage(messageContext, session.round, interaction);
            skipSong(messageContext, session);
        } else {
            logger.info(
                `${getDebugLogHeader(messageContext)} | Skip vote received.`,
            );

            await sendSkipNotification(
                messageContext,
                session.round,
                interaction,
            );
        }

        session.lastActiveNow();
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await SkipCommand.executeSkip(messageContext, interaction);
    }
}
