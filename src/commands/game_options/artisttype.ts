import { EMBED_ERROR_COLOR, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import { clickableSlashCommand } from "../../helpers/utils";
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
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type EmbedPayload from "../../interfaces/embed_payload";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "artisttype";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class ArtistTypeCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notPlaylistPrecheck },
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
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.artisttype.help.description",
            {
                soloists: `\`${ArtistType.SOLOIST}\``,
                groups: `\`${ArtistType.GROUP}\``,
                both: `\`${ArtistType.BOTH}\``,
            },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} artisttype:soloists`,
                explanation: i18n.translate(
                    guildID,
                    "command.artisttype.help.example.soloists",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} artisttype:groups`,
                explanation: i18n.translate(
                    guildID,
                    "command.artisttype.help.example.groups",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} artisttype:both`,
                explanation: i18n.translate(
                    guildID,
                    "command.artisttype.help.example.both",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.artisttype.help.example.reset",
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
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.artisttype.help.interaction.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.artisttype.help.interaction.description",
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "artisttype",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.artisttype.help.interaction.artistTypeOption",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.artisttype.help.interaction.artistTypeOption",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(ArtistType).map(
                                (artistType) => ({
                                    name: artistType,
                                    value: artistType,
                                }),
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "artist type" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "artist type" },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let artistType: ArtistType | null;

        if (parsedMessage.components.length === 0) {
            artistType = null;
        } else {
            artistType =
                parsedMessage.components[0]!.toLowerCase() as ArtistType;
        }

        await ArtistTypeCommand.updateOption(
            MessageContext.fromMessage(message),
            artistType,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        artistType: ArtistType | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = artistType == null;
        if (reset) {
            await guildPreference.reset(GameOption.ARTIST_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Artist type reset.`,
            );
        } else {
            await guildPreference.setArtistType(artistType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Artist type set to ${artistType}`,
            );
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Game option conflict between artist type and groups.`,
            );

            const embedPayload: EmbedPayload = {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.gameOptionConflict.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: clickableSlashCommand("groups"),
                        optionTwo: clickableSlashCommand("artisttype"),
                        optionOneCommand: clickableSlashCommand(
                            "groups",
                            OptionAction.RESET,
                        ),
                    },
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
            false,
            undefined,
            undefined,
            interaction,
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        let artistTypeValue: ArtistType | null;

        const action = interactionName as OptionAction;

        switch (action) {
            case OptionAction.RESET:
                artistTypeValue = null;
                break;
            case OptionAction.SET:
                artistTypeValue = interactionOptions[
                    "artisttype"
                ] as ArtistType;
                break;
            default:
                logger.error(`Unexpected interaction name: ${action}`);
                artistTypeValue = null;
                break;
        }

        await ArtistTypeCommand.updateOption(
            messageContext,
            artistTypeValue,
            interaction,
        );
    }
}
