import { IPCLogger } from "./logger";
import { OptionAction } from "./constants";
import {
    areUserAndBotInSameVoiceChannel,
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    tryCreateInteractionErrorAcknowledgement,
} from "./helpers/discord_utils";
import { getTimeUntilRestart } from "./helpers/management_utils";
import GameType from "./enums/game_type";
import GuildPreference from "./structures/guild_preference";
import KmqConfiguration from "./kmq_configuration";
import dbContext from "./database_context";
import i18n from "./helpers/localization_manager";
import type EmbedPayload from "./interfaces/embed_payload";
import type GameSession from "./structures/game_session";
import type PrecheckArgs from "./interfaces/precheck_args";

const logger = new IPCLogger("command_prechecks");

export default class CommandPrechecks {
    static async inSessionCommandPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { messageContext, session, errorMessage, interaction } =
            precheckArgs;

        if (!session) {
            if (interaction) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    i18n.translate(
                        messageContext.guildID,
                        "misc.failure.game.noneInProgress.title",
                    ),
                    i18n.translate(
                        messageContext.guildID,
                        "misc.failure.game.noneInProgress.description",
                    ),
                );
            }

            return false;
        }

        const userAndBotInSameChannel = areUserAndBotInSameVoiceChannel(
            messageContext.author.id,
            messageContext.guildID,
        );

        if (session.isListeningSession() && interaction) {
            if (!userAndBotInSameChannel) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    i18n.translate(
                        messageContext.guildID,
                        "misc.preCheck.title",
                    ),
                    i18n.translate(
                        messageContext.guildID,
                        errorMessage ?? "misc.preCheck.differentVC",
                    ),
                );

                return false;
            }

            return true;
        }

        const gameSession = session as GameSession;
        if (!userAndBotInSameChannel) {
            if (
                gameSession.gameType === GameType.ELIMINATION ||
                gameSession.gameType === GameType.TEAMS
            ) {
                if (!gameSession.sessionInitialized) {
                    // The bot doesn't join the voice channel until after /begin is called;
                    // players should still be able /end before that happens in these game modes
                    return true;
                }
            }

            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | User and bot are not in the same voice connection`,
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.differentVC",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async notListeningPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { session, messageContext, interaction } = precheckArgs;
        if (session && !session.isGameSession()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.notListeningSession",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async notInGamePrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { session, messageContext, interaction } = precheckArgs;
        if (session && session.isGameSession()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.notGameSession",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async debugServerPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { messageContext, errorMessage, interaction } = precheckArgs;
        const isDebugServer =
            process.env.DEBUG_SERVER_ID === messageContext.guildID;

        if (!isDebugServer) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | User attempted to use a command only usable in the debug server`,
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.debugServer",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async maintenancePrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { messageContext, interaction } = precheckArgs;
        if (KmqConfiguration.Instance.maintenanceModeEnabled()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.maintenanceMode.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.maintenanceMode.description",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async debugChannelPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { messageContext, errorMessage, interaction } = precheckArgs;
        const isDebugChannel =
            process.env.DEBUG_TEXT_CHANNEL_ID === messageContext.textChannelID;

        if (!isDebugChannel) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | User attempted to use a command only usable in the debug channel`,
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.debugChannel",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async competitionPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { messageContext, session, errorMessage, interaction } =
            precheckArgs;

        const gameSession = session as GameSession;
        if (
            !session ||
            session.isListeningSession() ||
            gameSession.gameType !== GameType.COMPETITION
        ) {
            return true;
        }

        const isModerator = await dbContext.kmq
            .selectFrom("competition_moderators")
            .select("user_id")
            .where("guild_id", "=", gameSession.guildID)
            .where("user_id", "=", messageContext.author.id)
            .executeTakeFirst();

        if (!isModerator) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | User attempted to use a command only available to moderators in a competition`,
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.competition",
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async notRestartingPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const timeUntilRestart = getTimeUntilRestart();
        if (timeUntilRestart !== null) {
            const { messageContext, interaction } = precheckArgs;
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.play.failure.botRestarting.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.play.failure.botRestarting.description",
                    { timeUntilRestart: `\`${timeUntilRestart}\`` },
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async notPlaylistPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { messageContext, interaction } = precheckArgs;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (guildPreference.isPlaylist()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.notPlaylist",
                    {
                        playlistResetCommand: clickableSlashCommand(
                            "playlist",
                            OptionAction.RESET,
                        ),
                    },
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);
            return false;
        }

        return true;
    }

    static async timerHiddenPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        const { session } = precheckArgs;
        if (
            !session ||
            session.isListeningSession() ||
            !(session as GameSession).isHiddenMode()
        ) {
            return true;
        }

        // Allow /timer change during hidden, but prevent disabling it
        if (!precheckArgs.interaction) {
            if (precheckArgs.parsedMessage!.action !== "timer") {
                return true;
            }

            if (precheckArgs.parsedMessage!.components.length > 0) {
                return true;
            }
        } else {
            if (precheckArgs.interaction!.data.name !== "timer") {
                return true;
            }

            const { interactionName } = getInteractionValue(
                precheckArgs.interaction,
            );

            const action = interactionName as OptionAction;
            if (action === OptionAction.SET) {
                return true;
            }
        }

        const embedPayload: EmbedPayload = {
            title: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.title",
            ),
            description: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.notHidden",
            ),
        };

        await sendErrorMessage(
            precheckArgs.messageContext,
            embedPayload,
            precheckArgs.interaction,
        );
        return false;
    }

    static async notSuddenDeathPrecheck(
        precheckArgs: PrecheckArgs,
    ): Promise<boolean> {
        if (
            !precheckArgs.session ||
            precheckArgs.session.isListeningSession() ||
            (precheckArgs.session as GameSession).gameType !==
                GameType.SUDDEN_DEATH
        ) {
            return true;
        }

        const embedPayload: EmbedPayload = {
            title: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.title",
            ),
            description: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.notSuddenDeath",
            ),
        };

        await sendErrorMessage(
            precheckArgs.messageContext,
            embedPayload,
            precheckArgs.interaction,
        );
        return false;
    }
}
