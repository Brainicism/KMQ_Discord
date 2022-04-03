import CommandPrechecks from "../../command_prechecks";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GameOption } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("artisttype");

export enum ArtistType {
    SOLOIST = "soloists",
    GROUP = "groups",
    BOTH = "both",
}

export const DEFAULT_ARTIST_TYPE = ArtistType.BOTH;

export default class ArtistTypeCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(ArtistType),
                name: "artistType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 0,
    };

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.artisttype.help.description",
            {
                both: `\`${ArtistType.BOTH}\``,
                groups: `\`${ArtistType.GROUP}\``,
                soloists: `\`${ArtistType.SOLOIST}\``,
            }
        ),
        examples: [
            {
                example: "`,artisttype soloists`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.soloists"
                ),
            },
            {
                example: "`,artisttype groups`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.groups"
                ),
            },
            {
                example: "`,artisttype both`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.both"
                ),
            },
            {
                example: "`,artisttype`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.artisttype.help.example.reset"
                ),
            },
        ],
        name: "artisttype",
        priority: 150,
        usage: ",artisttype [soloists | groups | both]",
    });

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            await guildPreference.reset(GameOption.ARTIST_TYPE);
            await sendOptionsMessage(
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
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: "`groups`",
                        optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                        optionTwo: "`artisttype`",
                    }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.title"
                ),
            });
            return;
        }

        const artistType = parsedMessage.components[0] as ArtistType;
        await guildPreference.setArtistType(artistType);
        await sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            [{ option: GameOption.ARTIST_TYPE, reset: false }]
        );

        logger.info(
            `${getDebugLogHeader(message)} | Artist type set to ${artistType}`
        );
    };
}
