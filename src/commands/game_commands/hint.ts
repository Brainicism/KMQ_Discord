import { IPCLogger } from "../../logger.js";
import { KmqImages } from "../../constants.js";
import {
    getDebugLogHeader,
    getMajorityCount,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import * as Eris from "eris";
import GameType from "../../enums/game_type.js";
import GuildPreference from "../../structures/guild_preference.js";
import MessageContext from "../../structures/message_context.js";
import Session from "../../structures/session.js";
import State from "../../state.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type EliminationScoreboard from "../../structures/elimination_scoreboard.js";
import type EmbedPayload from "../../interfaces/embed_payload.js";
import type GameSession from "../../structures/game_session.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "hint";
const logger = new IPCLogger(COMMAND_NAME);

export default class HintCommand implements BaseCommand {
    aliases = ["h"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notSuddenDeathPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.hint.help.description"),
        examples: [],
        priority: 1020,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await HintCommand.sendHint(MessageContext.fromMessage(message));
    };

    static sendHint = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        const gameSession = Session.getSession(messageContext.guildID) as
            | GameSession
            | undefined;

        if (!gameSession) {
            return;
        }

        const gameRound = gameSession.round;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (!gameRound) {
            return;
        }

        if (
            !(await HintCommand.validHintCheck(
                gameSession,
                guildPreference,
                messageContext,
                interaction,
            ))
        )
            return;

        gameRound.hintRequested(messageContext.author.id);

        if (HintCommand.isHintAvailable(messageContext, gameSession)) {
            gameRound.hintUsed = true;
            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.hint.title",
                ),
                description: gameRound.getHint(
                    messageContext.guildID,
                    guildPreference.gameOptions.guessModeType,
                    State.getGuildLocale(messageContext.guildID),
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            };

            await sendInfoMessage(
                messageContext,
                embedPayload,
                false,
                undefined,
                undefined,
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Hint majority received.`,
            );
        } else {
            await HintCommand.sendHintNotification(
                messageContext,
                gameSession,
                interaction,
            );

            logger.info(
                `${getDebugLogHeader(messageContext)} | Hint request received.`,
            );
        }
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await HintCommand.sendHint(messageContext, interaction);
    }

    static isHintMajority(
        messageContext: MessageContext,
        gameSession: GameSession,
    ): boolean {
        if (!gameSession.round) {
            return false;
        }

        if (gameSession.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard =
                gameSession.scoreboard as EliminationScoreboard;

            return (
                gameSession.round.getHintRequests() >=
                Math.floor(eliminationScoreboard.getAlivePlayersCount() * 0.5) +
                    1
            );
        }

        return (
            gameSession.round.getHintRequests() >=
            getMajorityCount(messageContext.guildID)
        );
    }

    static isHintAvailable(
        messageContext: MessageContext,
        gameSession: GameSession,
    ): boolean {
        if (!gameSession.round) return false;
        return (
            gameSession.round.hintUsed ||
            HintCommand.isHintMajority(messageContext, gameSession)
        );
    }

    static async sendHintNotification(
        messageContext: MessageContext,
        gameSession: GameSession,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        if (!gameSession.round) return;
        if (gameSession.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard =
                gameSession.scoreboard as EliminationScoreboard;

            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.hint.request.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.hint.request.description",
                        {
                            hintCounter: `${gameSession.round.getHintRequests()}/${
                                Math.floor(
                                    eliminationScoreboard.getAlivePlayersCount() *
                                        0.5,
                                ) + 1
                            }`,
                        },
                    ),
                },
                true,
                undefined,
                [],
                interaction,
            );
        } else {
            await sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.hint.request.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.hint.request.description",
                        {
                            hintCounter: `${gameSession.round.getHintRequests()}/${getMajorityCount(
                                messageContext.guildID,
                            )}`,
                        },
                    ),
                },
                true,
                undefined,
                [],
                interaction,
            );
        }
    }

    /**
     * @param gameSession - The game session
     * @param guildPreference - The guild preference
     * @param messageContext - The message context
     * @param interaction - The interaction
     * @returns whether the hint request was valid
     */
    static async validHintCheck(
        gameSession: GameSession,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<boolean> {
        if (gameSession.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard =
                gameSession.scoreboard as EliminationScoreboard;

            if (
                eliminationScoreboard.isPlayerEliminated(
                    messageContext.author.id,
                )
            ) {
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.hint.failure.invalidHintRequest.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.hint.failure.invalidHintRequest.eliminated.description",
                        ),
                        thumbnailUrl: KmqImages.NOT_IMPRESSED,
                    },
                    interaction,
                );
                return false;
            }
        }

        if (guildPreference.isMultipleChoiceMode()) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.hint.failure.invalidHintRequest.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.hint.failure.invalidHintRequest.multipleChoice.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction,
            );
            return false;
        }

        return true;
    }
}
