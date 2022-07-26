import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { generateHint, validHintCheck } from "./hint";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getMention } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type GameSession from "src/structures/game_session";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("forcehint");

export default class ForceHintCommand implements BaseCommand {
    aliases = ["fhint", "fh"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "forcehint",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.forcehint.help.description"
        ),
        usage: ",forcehint",
        examples: [],
        priority: 1009,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "forcehint",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.forcehint.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ForceHintCommand.sendForceHint(
            MessageContext.fromMessage(message)
        );
    };

    static sendForceHint = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> => {
        const gameSession = Session.getSession(
            messageContext.guildID
        ) as GameSession;

        const gameRound = gameSession?.round;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (
            !validHintCheck(
                gameSession,
                guildPreference,
                gameRound,
                messageContext,
                interaction
            )
        ) {
            return;
        }

        if (messageContext.author.id !== gameSession.owner.id) {
            await sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.forcehint.failure.notOwner.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.forcehint.failure.notOwner.description",
                        { mentionedUser: getMention(gameSession.owner.id) }
                    ),
                },
                interaction
            );
            return;
        }

        gameRound.hintRequested(messageContext.author.id);
        gameRound.hintUsed = true;
        await sendInfoMessage(
            messageContext,
            {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.hint.title"
                ),
                description: generateHint(
                    messageContext.guildID,
                    guildPreference.gameOptions.guessModeType,
                    gameRound
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            },
            null,
            null,
            [],
            interaction
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Owner force-hinted.`
        );
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await ForceHintCommand.sendForceHint(messageContext, interaction);
    }
}
