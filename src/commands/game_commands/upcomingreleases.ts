import { IPCLogger } from "../../logger.js";
import { KmqImages } from "../../constants.js";
import { chunkArray, discordDateFormat } from "../../helpers/utils.js";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendDeprecatedTextCommandMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils.js";
import * as Eris from "eris";
import KmqMember from "../../structures/kmq_member.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import State from "../../state.js";
import UpcomingRelease from "../../structures/upcoming_release.js";
import dbContext from "../../database_context.js";
import i18n from "../../helpers/localization_manager.js";
import type { CommandInteraction, EmbedOptions } from "eris";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type { GuildTextableMessage } from "../../types.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "upcomingreleases";
const logger = new IPCLogger(COMMAND_NAME);

enum ReleaseType {
    EP = "ep",
    Single = "single",
    Album = "album",
}

// eslint-disable-next-line import/no-unused-modules
export default class UpcomingReleasesCommand implements BaseCommand {
    static FIELDS_PER_EMBED = 9;
    aliases = ["upcoming"];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.upcomingreleases.help.description",
        ),
        examples: [
            {
                example: clickableSlashCommand(COMMAND_NAME),
                explanation: i18n.translate(
                    guildID,
                    "command.upcomingreleases.help.defaultExample",
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} release:album`,
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

        const upcomingReleases: Array<UpcomingRelease> = (
            await dbContext.kpopVideos
                .selectFrom("app_upcoming")
                .innerJoin(
                    "app_kpop_group_safe",
                    "app_upcoming.id_artist",
                    "app_kpop_group_safe.id",
                )
                .select([
                    "app_upcoming.name",
                    "app_kpop_group_safe.name as artistName",
                    "app_kpop_group_safe.id as artistID",
                    "app_kpop_group_safe.kname as hangulArtistName",
                    "app_upcoming.rtype as releaseType",
                    "app_upcoming.rdate as releaseDate",
                ])
                .orderBy("rdate", "asc")
                .where("app_upcoming.rdate", ">=", new Date())
                .where("app_upcoming.rtype", "!=", "undefined")
                .where("app_upcoming.name", "!=", "")
                .where(
                    "app_upcoming.rtype",
                    "in",
                    releaseType ? [releaseType] : Object.values(ReleaseType),
                )
                .execute()
        ).map((x) => new UpcomingRelease(x));

        if (upcomingReleases.length === 0) {
            await sendInfoMessage(
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
            name: `"${release.name}" - ${release.getLocalizedArtistName(
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

        const embedFieldSubsets = chunkArray(
            fields,
            UpcomingReleasesCommand.FIELDS_PER_EMBED,
        );

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
