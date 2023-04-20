import { IPCLogger } from "./logger";
import { OptionAction } from "./constants";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    tryCreateInteractionErrorAcknowledgement,
} from "./helpers/discord_utils";
import { getTimeUntilRestart } from "./helpers/management_utils";
import { isUserPremium } from "./helpers/game_utils";
import AnswerType from "./enums/option_types/answer_type";
import GameType from "./enums/game_type";
import GuildPreference from "./structures/guild_preference";
import KmqConfiguration from "./kmq_configuration";
import LocaleType from "./enums/locale_type";
import dbContext from "./database_context";
import i18n from "./helpers/localization_manager";
import type EmbedPayload from "./interfaces/embed_payload";
import type GameSession from "./structures/game_session";
import type PrecheckArgs from "./interfaces/precheck_args";

const logger = new IPCLogger("command_prechecks");

export default class CommandPrechecks {
    static inSessionCommandPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { messageContext, session, errorMessage, interaction } =
            precheckArgs;

        if (!session) {
            if (interaction) {
                tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    i18n.translate(
                        LocaleType.EN,
                        "misc.failure.game.noneInProgress.title"
                    ),
                    i18n.translate(
                        LocaleType.EN,
                        "misc.failure.game.noneInProgress.description"
                    )
                );
            }

            return false;
        }

        const userAndBotInSameChannel = areUserAndBotInSameVoiceChannel(
            messageContext.author.id,
            messageContext.guildID
        );

        if (session.isListeningSession() && interaction) {
            if (!userAndBotInSameChannel) {
                tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    i18n.translate(
                        messageContext.guildID,
                        "misc.preCheck.title"
                    ),
                    i18n.translate(
                        messageContext.guildID,
                        errorMessage ?? "misc.preCheck.differentVC"
                    )
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
                    messageContext
                )} | User and bot are not in the same voice connection`
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.differentVC"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static notListeningPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { session, messageContext, interaction } = precheckArgs;
        if (session && !session.isGameSession()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.notListeningSession"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static notInGamePrecheck(precheckArgs: PrecheckArgs): boolean {
        const { session, messageContext, interaction } = precheckArgs;
        if (session && session.isGameSession()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.notGameSession"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static debugServerPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { messageContext, errorMessage, interaction } = precheckArgs;
        const isDebugServer =
            process.env.DEBUG_SERVER_ID === messageContext.guildID;

        if (!isDebugServer) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | User attempted to use a command only usable in the debug server`
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.debugServer"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static maintenancePrecheck(precheckArgs: PrecheckArgs): boolean {
        const { messageContext, interaction } = precheckArgs;
        if (KmqConfiguration.Instance.maintenanceModeEnabled()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.maintenanceMode.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.maintenanceMode.description"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static debugChannelPrecheck(precheckArgs: PrecheckArgs): boolean {
        const { messageContext, errorMessage, interaction } = precheckArgs;
        const isDebugChannel =
            process.env.DEBUG_TEXT_CHANNEL_ID === messageContext.textChannelID;

        if (!isDebugChannel) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | User attempted to use a command only usable in the debug channel`
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.debugChannel"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async competitionPrecheck(
        precheckArgs: PrecheckArgs
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

        const isModerator = await dbContext
            .kmq("competition_moderators")
            .select("user_id")
            .where("guild_id", "=", gameSession.guildID)
            .andWhere("user_id", "=", messageContext.author.id)
            .first();

        if (!isModerator) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | User attempted to use a command only available to moderators in a competition`
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    errorMessage ?? "misc.preCheck.competition"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async notRestartingPrecheck(
        precheckArgs: PrecheckArgs
    ): Promise<boolean> {
        const timeUntilRestart = getTimeUntilRestart();
        if (timeUntilRestart !== null) {
            const { messageContext, interaction } = precheckArgs;
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.play.failure.botRestarting.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.play.failure.botRestarting.description",
                    { timeUntilRestart: `\`${timeUntilRestart}\`` }
                ),
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return false;
        }

        return true;
    }

    static async premiumPrecheck(precheckArgs: PrecheckArgs): Promise<boolean> {
        const { messageContext, interaction } = precheckArgs;
        const premium = await isUserPremium(messageContext.author.id);
        if (premium) {
            return true;
        }

        const embedPayload: EmbedPayload = {
            title: i18n.translate(
                messageContext.guildID,
                "misc.preCheck.title"
            ),
            description: i18n.translate(
                messageContext.guildID,
                "misc.preCheck.notPremium",
                { premium: "`/premium`" }
            ),
        };

        await sendErrorMessage(messageContext, embedPayload, interaction);

        return false;
    }

    static async premiumOrDebugServerPrecheck(
        precheckArgs: PrecheckArgs
    ): Promise<boolean> {
        const { messageContext, interaction } = precheckArgs;
        const premium = await isUserPremium(messageContext.author.id);
        const isDebugServer =
            process.env.DEBUG_SERVER_ID === messageContext.guildID;

        if (premium || isDebugServer) {
            return true;
        }

        logger.warn(
            `${getDebugLogHeader(
                messageContext
            )} | User attempted to use a command only usable in the debug server/for premium users`
        );

        const embedPayload: EmbedPayload = {
            title: i18n.translate(
                messageContext.guildID,
                "misc.preCheck.title"
            ),
            description: i18n.translate(
                messageContext.guildID,
                "misc.preCheck.premiumOrDebugServer",
                { premium: "`/premium`" }
            ),
        };

        sendErrorMessage(messageContext, embedPayload, interaction);

        return false;
    }

    static async notSpotifyPrecheck(
        precheckArgs: PrecheckArgs
    ): Promise<boolean> {
        const { messageContext, interaction } = precheckArgs;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (guildPreference.isSpotifyPlaylist()) {
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.title"
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.preCheck.notSpotify"
                ),
            };

            sendErrorMessage(messageContext, embedPayload, interaction);
            return false;
        }

        return true;
    }

    static answerHiddenPrecheck(precheckArgs: PrecheckArgs): boolean {
        if (
            !precheckArgs.session ||
            precheckArgs.session.isListeningSession() ||
            (precheckArgs.session as GameSession).gameType !== GameType.HIDDEN
        ) {
            return true;
        }

        if (!precheckArgs.interaction) {
            if (
                precheckArgs.parsedMessage.components.length === 0 ||
                [AnswerType.TYPING, AnswerType.TYPING_TYPOS].includes(
                    precheckArgs.parsedMessage.components[0] as AnswerType
                )
            ) {
                // Allow /answer change to different typing modes during hidden
                return true;
            }
        } else {
            const { interactionName, interactionOptions } = getInteractionValue(
                precheckArgs.interaction
            );

            const action = interactionName as OptionAction;
            if (action === OptionAction.SET) {
                if (
                    [AnswerType.TYPING, AnswerType.TYPING_TYPOS].includes(
                        interactionOptions["answer"] as AnswerType
                    )
                ) {
                    return true;
                }
            }
        }

        const embedPayload: EmbedPayload = {
            title: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.title"
            ),
            description: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.notHidden"
            ),
        };

        sendErrorMessage(
            precheckArgs.messageContext,
            embedPayload,
            precheckArgs.interaction
        );
        return false;
    }

    static timerHiddenPrecheck(precheckArgs: PrecheckArgs): boolean {
        if (
            !precheckArgs.session ||
            precheckArgs.session.isListeningSession() ||
            (precheckArgs.session as GameSession).gameType !== GameType.HIDDEN
        ) {
            return true;
        }

        if (!precheckArgs.interaction) {
            if (precheckArgs.parsedMessage.components.length > 0) {
                // Allow /timer change but not reset during hidden
                return true;
            }
        } else {
            const { interactionName } = getInteractionValue(
                precheckArgs.interaction
            );

            const action = interactionName as OptionAction;
            if (action === OptionAction.RESET) {
                return true;
            }
        }

        const embedPayload: EmbedPayload = {
            title: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.title"
            ),
            description: i18n.translate(
                precheckArgs.messageContext.guildID,
                "misc.preCheck.notHidden"
            ),
        };

        sendErrorMessage(
            precheckArgs.messageContext,
            embedPayload,
            precheckArgs.interaction
        );
        return false;
    }
}
