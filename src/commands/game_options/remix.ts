import { DEFAULT_REMIX_PREFERENCE, OptionAction } from "../../constants";
import { IPCLogger } from "../../logger";
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
import RemixPreference from "../../enums/option_types/remix_preference";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("remix");

export default class RemixCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    aliases = ["remixes"];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "remixPreference",
                type: "enum" as const,
                enums: Object.values(RemixPreference),
            },
        ],
    };

    help = (guildID: string): HelpDocumentation => ({
        name: "remix",
        description: i18n.translate(guildID, "command.remix.help.description"),
        usage: "/remix set\nremix:[include | exclude | exclusive]\n\n/remix reset",
        examples: [
            {
                example: "`/remix set remix:include`",
                explanation: i18n.translate(
                    guildID,
                    "command.remix.help.example.include"
                ),
            },
            {
                example: "`/remix set remix:exclude`",
                explanation: i18n.translate(
                    guildID,
                    "command.remix.help.example.exclude"
                ),
            },
            {
                example: "`/remix set remix:exclusive`",
                explanation: i18n.translate(
                    guildID,
                    "command.remix.help.example.exclusive"
                ),
            },
            {
                example: "`/remix reset`",
                explanation: i18n.translate(
                    guildID,
                    "command.remix.help.example.reset",
                    { defaultRemix: `\`${DEFAULT_REMIX_PREFERENCE}\`` }
                ),
            },
        ],
        priority: 130,
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
                        "command.remix.help.description"
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.remix.help.description"
                                ),
                            }),
                            {}
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "remix",
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.remix.interaction.remix"
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.remix.interaction.remix"
                                        ),
                                    }),
                                    {}
                                ),

                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(RemixPreference).map(
                                (remixPreference) => ({
                                    name: remixPreference,
                                    value: remixPreference,
                                })
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: i18n.translate(
                        LocaleType.EN,
                        "misc.interaction.resetOption",
                        { optionName: "remix" }
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "misc.interaction.resetOption",
                                    { optionName: "remix" }
                                ),
                            }),
                            {}
                        ),

                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let remixPreference: RemixPreference | null;

        if (parsedMessage.components.length === 0) {
            remixPreference = null;
        } else {
            remixPreference =
                parsedMessage.components[0].toLowerCase() as RemixPreference;
        }

        await RemixCommand.updateOption(
            MessageContext.fromMessage(message),
            remixPreference,
            undefined
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        remixPreference: RemixPreference | null,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const reset = remixPreference == null;
        if (reset) {
            await guildPreference.reset(GameOption.REMIX_PREFERENCE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Remix preference reset.`
            );
        } else {
            await guildPreference.setRemixPreference(remixPreference);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Remix preference set to ${remixPreference}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.REMIX_PREFERENCE, reset }],
            false,
            undefined,
            undefined,
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

        let remixValue: RemixPreference | null;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            remixValue = null;
        } else if (action === OptionAction.SET) {
            remixValue = interactionOptions["remix"] as RemixPreference;
        } else {
            logger.error(`Unexpected interaction name: ${interactionName}`);
            remixValue = null;
        }

        await RemixCommand.updateOption(
            messageContext,
            remixValue,
            interaction
        );
    }
}
