import { IPCLogger } from "../../logger";
import { clickableSlashCommand } from "../../helpers/utils";
import {
    getInteractionValue,
    sendDeprecatedTextCommandMessage,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GameType from "../../enums/game_type";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { CommandInteraction } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "guess";
const logger = new IPCLogger(COMMAND_NAME);

const MIN_GUESS_LENGTH = 1;
const MAX_GUESS_LENGTH = 500;

export default class GuessCommand implements BaseCommand {
    aliases = [];
    validations = {
        minArgCount: 1,
        arguments: [],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.guess.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} name:madness`,
                explanation: i18n.translate(
                    guildID,
                    "command.guess.help.example.song",
                    { song: "madness" },
                ),
            },
        ],
        priority: 40,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "name",
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.guess.interaction.name",
                    ),
                    description_localizations: {
                        [LocaleType.KO]: i18n.translate(
                            LocaleType.KO,
                            "command.guess.interaction.name",
                        ),
                    },
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    min_length: MIN_GUESS_LENGTH,
                    max_length: MAX_GUESS_LENGTH,
                },
            ],
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for guess");
        await sendDeprecatedTextCommandMessage(
            MessageContext.fromMessage(message),
        );
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        const session = Session.getSession(interaction.guildID as string);
        if (!session) {
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

        if (session && session.isGameSession()) {
            if (session.gameType !== GameType.HIDDEN) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    i18n.translate(
                        messageContext.guildID,
                        "command.guess.interaction.failure.notHidden.title",
                    ),
                    i18n.translate(
                        messageContext.guildID,
                        "command.guess.interaction.failure.notHidden.description",
                        {
                            guessCommand: clickableSlashCommand(COMMAND_NAME),
                            playHiddenCommand: clickableSlashCommand(
                                "play",
                                GameType.HIDDEN,
                            ),
                        },
                    ),
                );
                return;
            }

            await tryCreateInteractionSuccessAcknowledgement(
                interaction,
                i18n.translate(
                    messageContext.guildID,
                    "command.guess.interaction.guessReceived.title",
                ),
                i18n.translate(
                    messageContext.guildID,
                    "command.guess.interaction.guessReceived.description",
                    {
                        guess: `\`\`${interactionData.interactionOptions["name"]}\`\``,
                    },
                ),
                true,
            );

            await session.guessSong(
                messageContext,
                interactionData.interactionOptions["name"],
                interaction.createdAt,
            );
        }
    }
}
