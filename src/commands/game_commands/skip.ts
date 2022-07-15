import { EMBED_SUCCESS_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    getMajorityCount,
    sendInfoMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameType from "../../enums/game_type";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EliminationScoreboard from "../../structures/elimination_scoreboard";
import type HelpDocumentation from "../../interfaces/help";
import type Round from "../../structures/round";

const logger = new IPCLogger("skip");

async function sendSkipNotification(
    messageContext: MessageContext,
    round: Round,
    interaction?: Eris.CommandInteraction
): Promise<void> {
    const embedPayload = {
        title: LocalizationManager.localizer.translate(
            messageContext.guildID,
            "command.skip.vote.title"
        ),
        description: LocalizationManager.localizer.translate(
            messageContext.guildID,
            "command.skip.vote.description",
            {
                skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                    messageContext.guildID
                )}`,
            }
        ),
    };

    if (interaction) {
        await tryCreateInteractionCustomPayloadAcknowledgement(
            messageContext,
            interaction,
            embedPayload
        );
    } else {
        sendInfoMessage(messageContext, embedPayload, true);
    }

    logger.info(
        `${getDebugLogHeader(messageContext)} | Vote instructions retrieved.`
    );
}

async function sendSkipMessage(
    messageContext: MessageContext,
    round: Round,
    interaction?: Eris.CommandInteraction
): Promise<void> {
    const embedPayload = {
        color: EMBED_SUCCESS_COLOR,
        title: LocalizationManager.localizer.translate(
            messageContext.guildID,
            "misc.skip"
        ),
        description: LocalizationManager.localizer.translate(
            messageContext.guildID,
            "command.skip.success.description",
            {
                skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                    messageContext.guildID
                )}`,
            }
        ),
        thumbnailUrl: KmqImages.NOT_IMPRESSED,
    };

    if (interaction) {
        await tryCreateInteractionCustomPayloadAcknowledgement(
            messageContext,
            interaction,
            embedPayload
        );
    } else {
        await sendInfoMessage(messageContext, embedPayload);
    }
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

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "skip",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.skip.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await SkipCommand.executeSkip(MessageContext.fromMessage(message));
    };

    static async executeSkip(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        if (interaction) {
            await tryCreateInteractionSuccessAcknowledgement(
                interaction,
                LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.interaction.genericProgress.title"
                ),
                LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.interaction.genericProgress.description"
                )
            );
        }

        const session = Session.getSession(messageContext.guildID);

        if (!session) {
            if (interaction) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "misc.failure.game.noneInProgress.title"
                    ),
                    LocalizationManager.localizer.translateByLocale(
                        LocaleType.EN,
                        "misc.failure.game.noneInProgress.description"
                    )
                );
            }

            return;
        }

        if (
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            return;
        }

        if (
            !areUserAndBotInSameVoiceChannel(
                messageContext.author.id,
                messageContext.guildID
            )
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Invalid skip. User and bot are not in the same voice channel.`
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
                            messageContext
                        )} | User skipped, elimination mode`
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
                `${getDebugLogHeader(messageContext)} | Skip vote received.`
            );

            await sendSkipNotification(
                messageContext,
                session.round,
                interaction
            );
        }

        session.lastActiveNow();
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await SkipCommand.executeSkip(messageContext, interaction);
    }
}
