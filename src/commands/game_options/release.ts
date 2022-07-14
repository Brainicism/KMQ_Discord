import { DEFAULT_RELEASE_TYPE } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    generateOptionsMessage,
    getDebugLogHeader,
    sendOptionsMessage,
    tryCreateInteractionCustomPayloadAcknowledgement,
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
                    required: true,
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
        let releaseType: ReleaseType;
        if (parsedMessage.components.length === 0) {
            releaseType = null;
        } else {
            releaseType =
                parsedMessage.components[0].toLowerCase() as ReleaseType;
        }

        await ReleaseCommand.updateOption(
            MessageContext.fromMessage(message),
            releaseType
        );
    };

    static async updateOption(
        messageContext: MessageContext,
        releaseType: ReleaseType,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

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
            const embedPayload = await generateOptionsMessage(
                Session.getSession(messageContext.guildID),
                messageContext,
                guildPreference,
                [{ option: GameOption.RELEASE_TYPE, reset }]
            );

            await tryCreateInteractionCustomPayloadAcknowledgement(
                messageContext,
                interaction,
                embedPayload
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
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    static async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        const releaseType = interaction.data.options[0]["value"] as ReleaseType;

        await ReleaseCommand.updateOption(
            messageContext,
            releaseType,
            interaction
        );
    }
}
