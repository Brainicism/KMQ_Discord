import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import {
    sendOptionsMessage,
    getDebugLogHeader,
    sendErrorMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("artisttype");

export enum ArtistType {
    SOLOIST = "soloists",
    GROUP = "groups",
    BOTH = "both",
}

export const DEFAULT_ARTIST_TYPE = ArtistType.BOTH;

export default class ArtistTypeCommand implements BaseCommand {
    helpPriority = 150;

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

    help = (guildID: string): Help => ({
        name: "artisttype",
        description: state.localizer.translate(
            guildID,
            "artisttype.help.description",
            {
                soloists: `\`${ArtistType.SOLOIST}\``,
                groups: `\`${ArtistType.GROUP}\``,
                both: `\`${ArtistType.BOTH}\``,
            }
        ),
        usage: ",artisttype [artistType]",
        examples: [
            {
                example: "`,artisttype soloists`",
                explanation: state.localizer.translate(
                    guildID,
                    "artisttype.help.example.soloists",
                    {
                        soloists: `\`${ArtistType.SOLOIST}\``,
                    }
                ),
            },
            {
                example: "`,artisttype groups`",
                explanation: state.localizer.translate(
                    guildID,
                    "artisttype.help.example.groups",
                    {
                        groups: `\`${ArtistType.GROUP}\``,
                    }
                ),
            },
            {
                example: "`,artisttype both`",
                explanation: state.localizer.translate(
                    guildID,
                    "artisttype.help.example.both",
                    {
                        soloists: `\`${ArtistType.SOLOIST}\``,
                        groups: `\`${ArtistType.GROUP}\``,
                    }
                ),
            },
            {
                example: "`,artisttype`",
                explanation: state.localizer.translate(
                    guildID,
                    "artisttype.help.example.reset"
                ),
            },
        ],
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
                title: "misc.failure.gameOptionConflict.title",
                description: state.localizer.translate(
                    message.guildID,
                    "misc.failure.gameOptionConflict.description",
                    {
                        optionOne: `\`${GameOption.GROUPS}\``,
                        optionTwo: `\`${GameOption.ARTIST_TYPE}\``,
                        optionOneCommand: `\`${process.env.BOT_PREFIX}groups\``,
                    }
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
