import { ArtistType } from "../../enums/option_types/artist_type";
import { GameOption } from "../../enums/game_option_name";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import GuildPreference from "../../structures/guild_preference";
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

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.ARTIST_TYPE);
            await sendOptionsMessage(
                Session.getSession(message.guildID),
                MessageContext.fromMessage(message),
                guildPreference,
                [{ option: GameOption.ARTIST_TYPE, reset: true }]
            );
            logger.info(`${getDebugLogHeader(message)} | Artist type reset.`);
            return;
        }

        if (guildPreference.isGroupsMode()) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Game option conflict between artist type and groups.`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.title"
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: "`groups`",
                        optionTwo: "`artisttype`",
                        optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                    }
                ),
            });
            return;
        }

        const artistType = parsedMessage.components[0] as ArtistType;
        await guildPreference.setArtistType(artistType);
        await sendOptionsMessage(
            Session.getSession(message.guildID),
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.ARTIST_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Artist type set to ${artistType}`
        );
    };
}
