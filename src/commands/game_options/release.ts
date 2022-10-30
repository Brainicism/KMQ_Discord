import { DEFAULT_RELEASE_TYPE, OptionAction } from "../../constants";
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
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import ReleaseType from "../../enums/option_types/release_type";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("release");

export default class ReleaseCommand implements BaseCommand {
    aliases = ["releases", "videotype"];

    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSpotifyPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "release",
                type: "enum" as const,
                enums: Object.values(ReleaseType),
            },
        ],
    };

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "release",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.release.help.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: OptionAction.SET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.release.help.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: "release",
                            description:
                                LocalizationManager.localizer.translate(
                                    LocaleType.EN,
                                    "command.release.help.interaction.description"
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(ReleaseType).map(
                                (releaseType) => ({
                                    name: releaseType,
                                    value: releaseType,
                                })
                            ),
                        },
                    ],
                },
                {
                    name: OptionAction.RESET,
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.release.help.interaction.description"
                    ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [],
                },
            ],
        },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "release",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.release.help.description"
        ),
        usage: ",release [official | all]",
        examples: [
            {
                example: "`,release official`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.release.help.example.official",
                    { official: `\`${ReleaseType.OFFICIAL}\`` }
                ),
            },
            {
                example: "`,release all`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.release.help.example.all"
                ),
            },
            {
                example: "`,release`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.release.help.example.reset",
                    { defaultRelease: `\`${DEFAULT_RELEASE_TYPE}\`` }
                ),
            },
        ],
        priority: 130,
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        let releaseType: ReleaseType;
        if (parsedMessage.components.length === 0) {
            releaseType = null;
        } else {
            releaseType =
                parsedMessage.components[0].toLowerCase() as ReleaseType;
        }

        await ReleaseCommand.updateOption(
            MessageContext.fromMessage(message),
            releaseType,
            null,
            releaseType == null
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        releaseType: ReleaseType,
        interaction?: Eris.CommandInteraction,
        reset = false
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        if (reset) {
            await guildPreference.reset(GameOption.RELEASE_TYPE);
            logger.info(
                `${getDebugLogHeader(messageContext)} | Release type reset.`
            );
        } else {
            await guildPreference.setReleaseType(releaseType);
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Release type set to ${releaseType}`
            );
        }

        await sendOptionsMessage(
            Session.getSession(messageContext.guildID),
            messageContext,
            guildPreference,
            [{ option: GameOption.RELEASE_TYPE, reset }],
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

        let releaseValue: ReleaseType;

        const action = interactionName as OptionAction;
        if (action === OptionAction.RESET) {
            releaseValue = null;
        } else if (action === OptionAction.SET) {
            releaseValue = interactionOptions["release"] as ReleaseType;
        }

        await ReleaseCommand.updateOption(
            messageContext,
            releaseValue,
            interaction,
            releaseValue == null
        );
    }
}
