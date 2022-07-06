import { DEFAULT_RELEASE_TYPE } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateEmbed,
    generateOptionsMessage,
    getDebugLogHeader,
    sendOptionsMessage,
    tryCreateInteractionSuccessAcknowledgement,
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

    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

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
            description: LocalizationManager.localizer.translateByLocale(
                LocaleType.EN,
                "command.release.help.interaction.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "release",
                    description:
                        LocalizationManager.localizer.translateByLocale(
                            LocaleType.EN,
                            "command.release.help.interaction.description"
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: false,
                    choices: Object.values(ReleaseType).map((releaseType) => ({
                        name: releaseType,
                        value: releaseType,
                    })),
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
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        let releaseType: ReleaseType;
        if (parsedMessage.components.length === 0) {
            releaseType = null;
        } else {
            releaseType =
                parsedMessage.components[0].toLowerCase() as ReleaseType;
        }

        await ReleaseCommand.updateOption(
            guildPreference,
            MessageContext.fromMessage(message),
            releaseType
        );
    };

    static async updateOption(
        guildPreference: GuildPreference,
        messageContext: MessageContext,
        releaseType: ReleaseType,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const reset = releaseType === null;
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

        if (interaction) {
            const message = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.RELEASE_TYPE, reset }]
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
                [{ option: GameOption.RELEASE_TYPE, reset }]
            );
        }
    }

    /**
     * Handles setting the groups for the final groups slash command state
     * @param interaction - The completed groups interaction
     * @param messageContext - The source of the interaction
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        if (interaction instanceof Eris.CommandInteraction) {
            if (
                interaction.data.type ===
                Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
            ) {
                logger.info(
                    `${getDebugLogHeader(interaction)} | ${
                        interaction.data.name
                    } slash command received`
                );

                let releaseType: ReleaseType;
                if (interaction.data.options == null) {
                    releaseType = null;
                } else {
                    releaseType = interaction.data.options[0][
                        "value"
                    ] as ReleaseType;
                }

                const guildPreference =
                    await GuildPreference.getGuildPreference(
                        interaction.guildID
                    );

                await ReleaseCommand.updateOption(
                    guildPreference,
                    messageContext,
                    releaseType,
                    interaction
                );
            }
        }
    }
}
