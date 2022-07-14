import { IPCLogger } from "../../logger";
import {
    generateEmbed,
    generateOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
} from "../../helpers/discord_utils";
import ArtistType from "../../enums/option_types/artist_type";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("artisttype");

export default class ArtistTypeCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "artistType",
                type: "enum" as const,
                enums: Object.values(ArtistType),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "artisttype",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.artisttype.help.description",
            {
                soloists: `\`${ArtistType.SOLOIST}\``,
                groups: `\`${ArtistType.GROUP}\``,
                both: `\`${ArtistType.BOTH}\``,
            }
        ),
        usage: ",artisttype [soloists | groups | both]",
        examples: [
            {
                example: "`,artisttype soloists`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.soloists"
                ),
            },
            {
                example: "`,artisttype groups`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.groups"
                ),
            },
            {
                example: "`,artisttype both`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.both"
                ),
            },
            {
                example: "`,artisttype`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.reset"
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "artisttype",
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.artisttype.help.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "artisttype",
                    description:
                        LocalizationManager.localizer.translateByLocale(
                            LocaleType.EN,
                            "command.artisttype.help.interaction.description"
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: true,
                    choices: Object.values(ArtistType).map((artistType) => ({
                        name: artistType,
                        value: artistType,
                    })),
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let artistType: ArtistType;

        if (parsedMessage.components.length === 0) {
            artistType = null;
        } else {
            artistType =
                parsedMessage.components[0].toLowerCase() as ArtistType;
        }

        await ArtistTypeCommand.updateOption(
            MessageContext.fromMessage(message),
            artistType
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        artistType: ArtistType,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = artistType === null;

        if (reset) {
            await guildPreference.reset(GameOption.ARTIST_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Artist type reset.`
            );
        } else {
            await guildPreference.setArtistType(artistType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Artist type set to ${artistType}`
            );
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Game option conflict between artist type and groups.`
            );

            const embedPayload = {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.failure.gameOptionConflict.title"
                ),
                description: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: "`groups`",
                        optionTwo: "`artisttype`",
                        optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                    }
                ),
            };

            if (interaction) {
                const embed = generateEmbed(messageContext, embedPayload, true);
                tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    null,
                    null,
                    {
                        embeds: [embed],
                    }
                );
            } else {
                sendErrorMessage(messageContext, embedPayload);
            }

            return;
        }

        if (interaction) {
            const message = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.ARTIST_TYPE, reset }]
            );

            const embed = generateEmbed(messageContext, message, true);
            tryCreateInteractionSuccessAcknowledgement(
                interaction,
                null,
                null,
                { embeds: [embed] }
            );
        } else {
            await sendOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.ARTIST_TYPE, reset }]
            );
        }
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const artistType = interaction.data.options[0]["value"] as ArtistType;

        await ArtistTypeCommand.updateOption(
            messageContext,
            artistType,
            interaction
        );
    }
}
