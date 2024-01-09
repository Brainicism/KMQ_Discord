import { DEFAULT_SUBUNIT_PREFERENCE, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
import { clickableSlashCommand } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import SubunitsPreference from "../../enums/option_types/subunit_preference";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "subunits";
const logger = new IPCLogger(COMMAND_NAME);

export default class SubunitsCommand implements BaseCommand {
    aliases = ["subunit", "su"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "subunitPreference",
                type: "enum" as const,
                enums: Object.values(SubunitsPreference),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.subunits.help.description",
            { groups: clickableSlashCommand("groups") },
        ),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} subunits:include`,
                explanation: i18n.translate(
                    guildID,
                    "command.subunits.help.example.include",
                    {
                        groupCommand: clickableSlashCommand("groups"),
                        parentGroup: "BTS",
                        subunitOne: "J-Hope",
                        subunitTwo: "RM",
                    },
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.SET,
                )} subunits:exclude`,
                explanation: i18n.translate(
                    guildID,
                    "command.subunits.help.example.exclude",
                ),
            },
            {
                example: clickableSlashCommand(
                    COMMAND_NAME,
                    OptionAction.RESET,
                ),
                explanation: i18n.translate(
                    guildID,
                    "command.subunits.help.example.reset",
                    { defaultSubunit: `\`${DEFAULT_SUBUNIT_PREFERENCE}\`` },
                ),
            },
        ],
        priority: 130,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            name: COMMAND_NAME,
            description: i18n.translate(
                LocaleType.EN,
                "command.subunits.help.description",
                { groups: clickableSlashCommand("groups") },
            ),
            descriptionLocalizations: {
                [LocaleType.KO]: i18n.translate(
                    LocaleType.KO,
                    "command.subunits.help.description",
                    { groups: clickableSlashCommand("groups") },
                ),
            },
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.subunits.help.description",
                        {
                            groups: clickableSlashCommand("groups"),
                        },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.subunits.help.description",
                                    {
                                        groups: clickableSlashCommand("groups"),
                                    },
                                ),
                            }),
                            {},
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "subunits",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.subunits.interaction.subunits",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.subunits.interaction.subunits",
                                        ),
                                    }),
                                    {},
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(SubunitsPreference).map(
                                (subunitPreference) => ({
                                    name: subunitPreference,
                                    value: subunitPreference,
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
                        { optionName: "subunits" },
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "subunits" },
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
        let subunitsPreference: SubunitsPreference | null;

        if (parsedMessage.components.length === 0) {
            subunitsPreference = null;
        } else {
            subunitsPreference =
                parsedMessage.components[0].toLowerCase() as SubunitsPreference;
        }

        await SubunitsCommand.updateOption(
            MessageContext.fromMessage(message),
            subunitsPreference,
            undefined,
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        subunitsPreference: SubunitsPreference | null,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        const reset = subunitsPreference == null;
        if (reset) {
            await guildPreference.reset(GameOption.SUBUNIT_PREFERENCE);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Subunit preference reset.`,
            );
        } else {
            await guildPreference.setSubunitPreference(subunitsPreference);
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Subunit preference set to ${subunitsPreference}`,
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.SUBUNIT_PREFERENCE, reset }],
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

        let subunitsValue: SubunitsPreference | null;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            subunitsValue = null;
        } else if (action === OptionAction.SET) {
            subunitsValue = interactionOptions[
                "subunits"
            ] as SubunitsPreference;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            subunitsValue = null;
        }

        await SubunitsCommand.updateOption(
            messageContext,
            subunitsValue,
            interaction,
        );
    }
}
