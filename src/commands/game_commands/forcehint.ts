import * as Eris from "eris";
import { IPCLogger } from "../../logger.js";
import { KmqImages } from "../../constants.js";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils.js";
import { getMention } from "../../helpers/utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import GuildPreference from "../../structures/guild_preference.js";
import HintCommand from "./hint.js";
import MessageContext from "../../structures/message_context.js";
import Session from "../../structures/session.js";
import State from "../../state.js";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type GameSession from "../../structures/game_session.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "forcehint";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class ForceHintCommand implements BaseCommand {
    aliases = ["fhint", "fh"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notSuddenDeathPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.forcehint.help.description",
        ),
        examples: [],
        priority: 1009,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ForceHintCommand.sendForceHint(
            MessageContext.fromMessage(message),
        );
    };

    static sendForceHint = async (
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
        if (!gameRound) return;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        if (
            !(await HintCommand.validHintCheck(
                gameSession,
                guildPreference,
                messageContext,
                interaction,
            ))
        ) {
            return;
        }

        if (messageContext.author.id !== gameSession.owner.id) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.forcehint.hintIgnored",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.forcehint.failure.notOwner.description",
                        { mentionedUser: getMention(gameSession.owner.id) },
                    ),
                },
                interaction,
            );
            return;
        }

        gameRound.hintRequested(messageContext.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(
            messageContext,
            {
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
            },
            false,
            undefined,
            [],
            interaction,
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Owner force-hinted.`,
        );
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await ForceHintCommand.sendForceHint(messageContext, interaction);
    }
}
