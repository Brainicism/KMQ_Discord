import type BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import {
    getDebugLogHeader,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { GameOption } from "../../enums/game_option_name";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { ReleaseType } from "../../enums/option_types/release_type";
import { DEFAULT_RELEASE_TYPE } from "../../constants";
import LocalizationManager from "../../helpers/localization_manager";

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
        const guildPreference = await getGuildPreference(message.guildID);

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.RELEASE_TYPE);
            await sendOptionsMessage(
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.RELEASE_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Video type reset.`);
            return;
        }

        const releaseType =
            parsedMessage.components[0].toLowerCase() as ReleaseType;

        await guildPreference.setReleaseType(releaseType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.RELEASE_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Video type set to ${releaseType}`
        );
    };
}
