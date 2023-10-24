import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { chunkArray, discordDateFormat } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendDeprecatedTextCommandMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils";
import { getLocalizedArtistName } from "../../helpers/game_utils";
import Eris from "eris";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import type { CommandInteraction, EmbedOptions } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "src/interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("upcomingreleases");

const FIELDS_PER_EMBED = 9;

interface UpcomingRelease {
    name: string;
    artistName: string;
    hangulArtistName: string | null;
    releaseType: "album" | "ep" | "single" | "undefined";
    releaseDate: Date;
    artistID: number;
}

enum ReleaseType {
    EP = "ep",
    Single = "single",
    Album = "album",
}

export default class UpcomingReleasesCommand implements BaseCommand {
    aliases = ["upcoming"];

    help = (guildID: string): HelpDocumentation => ({
        name: "upcomingreleases",
        description: i18n.translate(
            guildID,
            "command.upcomingreleases.help.description",
        ),
        usage: "/upcomingreleases release:[single | album | ep]",
        examples: [
            {
                example: "`/upcomingreleases`",
                explanation: i18n.translate(
                    guildID,
                    "command.upcomingreleases.help.defaultExample",
                ),
            },
            {
                example: "`/upcomingreleases release:album`",
                explanation: i18n.translate(
                    guildID,
                    "command.upcomingreleases.help.albumExample",
                ),
            },
        ],
        priority: 30,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "release",
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.upcomingreleases.help.interaction.releaseType",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.upcomingreleases.help.interaction.releaseType",
                                ),
                            }),
                            {},
                        ),

                    required: false,
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    choices: Object.values(ReleaseType).map((releaseType) => ({
                        name: releaseType,
                        value: releaseType,
                    })),
                },
            ],
        },
    ];

    static async showUpcomingReleases(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
        releaseType?: ReleaseType,
    ): Promise<void> {
        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member!.id),
            messageOrInteraction.guildID as string,
        );

        const upcomingReleases: Array<UpcomingRelease> =
            await dbContext.kpopVideos
                .selectFrom("app_upcoming")
                .innerJoin(
                    "app_kpop_group",
                    "app_upcoming.id_artist",
                    "app_kpop_group.id",
                )
                .select([
                    "app_upcoming.name",
                    "app_kpop_group.name as artistName",
                    "app_kpop_group.id as artistID",
                    "kname as hangulArtistName",
                    "rtype as releaseType",
                    "rdate as releaseDate",
                ])
                .orderBy("rdate", "asc")
                .where("rdate", ">=", new Date())
                .where("rtype", "!=", "undefined")
                .where("app_upcoming.name", "!=", "")
                .where(
                    "rtype",
                    "in",
                    releaseType ? [releaseType] : Object.values(ReleaseType),
                )
                .execute();

        if (upcomingReleases.length === 0) {
            sendInfoMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.upcomingreleases.failure.noReleases.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.upcomingreleases.failure.noReleases.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                false,
                undefined,
                [],
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
            );
            return;
        }

        const locale = State.getGuildLocale(messageContext.guildID);
        const fields = upcomingReleases.map((release) => ({
            name: `"${release.name}" - ${getLocalizedArtistName(
                release,
                locale,
            )}`,
            value: `${discordDateFormat(
                release.releaseDate,
                "d",
            )}\n${i18n.translate(
                messageContext.guildID,
                `command.upcomingreleases.${release.releaseType}`,
            )}`,
            inline: true,
        }));

        const embedFieldSubsets = chunkArray(fields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                title: i18n.translate(
                    messageContext.guildID,
                    "command.upcomingreleases.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.upcomingreleases.description",
                ),
                fields: embedFieldsSubset,
            }),
        );

        await sendPaginationedEmbed(messageOrInteraction, embeds, undefined);
        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Upcoming releases retrieved.`,
        );
    }

    /**
     * @param interaction - The interaction
     * @param _messageContext - Unused
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        _messageContext: MessageContext,
    ): Promise<void> {
        const { interactionOptions } = getInteractionValue(interaction);
        await UpcomingReleasesCommand.showUpcomingReleases(
            interaction,
            interactionOptions["release"] as ReleaseType,
        );
    }

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for upcomingreleases");
        await sendDeprecatedTextCommandMessage(
            MessageContext.fromMessage(message),
        );
    };
}
