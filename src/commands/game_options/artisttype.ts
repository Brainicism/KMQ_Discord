import { EMBED_ERROR_COLOR, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendOptionsMessage,
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
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("artisttype");

export default class ArtistTypeCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

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
        description: LocalizationManager.translate(
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
                explanation: LocalizationManager.translate(
                    guildID,
                    "command.artisttype.help.example.soloists"
                ),
            },
            {
                example: "`,artisttype groups`",
                explanation: LocalizationManager.translate(
                    guildID,
                    "command.artisttype.help.example.groups"
                ),
            },
            {
                example: "`,artisttype both`",
                explanation: LocalizationManager.translate(
                    guildID,
                    "command.artisttype.help.example.both"
                ),
            },
            {
                example: "`,artisttype`",
                explanation: LocalizationManager.translate(
                    guildID,
                    "command.artisttype.help.example.reset"
                ),
            },
        ],
        priority: 150,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.translate(
                        LocaleType.EN,
                        "command.artisttype.help.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "artisttype",
                            description: LocalizationManager.translate(
                                LocaleType.EN,
                                "command.artisttype.help.interaction.artistTypeOption"
                            ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(ArtistType).map(
                                (artistType) => ({
                                    name: artistType,
                                    value: artistType,
                                })
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: LocalizationManager.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "artist type" }
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
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
            artistType,
            null,
            artistType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        artistType: ArtistType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

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

            const embedPayload: EmbedPayload = {
                title: LocalizationManager.translate(
                    messageContext.guildID,
                    "misc.failure.gameOptionConflict.title"
                ),
                description: LocalizationManager.translate(
                    messageContext.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: "`groups`",
                        optionTwo: "`artisttype`",
                        optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                    }
                ),
                color: EMBED_ERROR_COLOR,
            };

            await sendErrorMessage(messageContext, embedPayload, interaction);

            return;
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.ARTIST_TYPE, reset }],
            null,
            null,
            null,
            interaction
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        let artistTypeValue: ArtistType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            artistTypeValue = null;
        } else if (action === OptionAction.SET) {
            artistTypeValue = interactionOptions["artisttype"] as ArtistType;
        } else {
            logger.error(`Unexpected interaction name: ${action}`);
            artistTypeValue = null;
        }

        await ArtistTypeCommand.updateOption(
            messageContext,
            artistTypeValue,
            interaction,
            artistTypeValue == null
        );
    }
}
