import {
    EMBED_SUCCESS_BONUS_COLOR,
    generateEmbed,
    generateOptionsMessage,
    getDebugLogHeader,
    getUserVoiceChannel,
    sendErrorMessage,
    sendInfoMessage,
    voicePermissionsCheck,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import MusicSession from "../../structures/music_session";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import KmqMember from "../../structures/kmq_member";
import { chooseWeightedRandom } from "../../helpers/utils";
import dbContext from "../../database_context";
import type Eris from "eris";
import { KmqImages } from "../../constants";
import Session from "../../structures/session";
import CommandPrechecks from "../../command_prechecks";
import type GuildPreference from "src/structures/guild_preference";
import type GameInfoMessage from "../../interfaces/game_info_message";
import type HelpDocumentation from "../../interfaces/help";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("music");

/**
 * Sends the beginning of game session message
 * @param textChannelName - The name of the text channel to send the message to
 * @param voiceChannelName - The name of the voice channel to join
 * @param messageContext - The original message that triggered the command
 * @param guildPreference - The guild's preferences
 */
export async function sendBeginMusicSessionMessage(
    textChannelName: string,
    voiceChannelName: string,
    messageContext: MessageContext,
    guildPreference: GuildPreference
): Promise<void> {
    const startTitle = State.localizer.translate(
        messageContext.guildID,
        "command.music.musicStarting",
        {
            textChannelName,
            voiceChannelName,
        }
    );

    const gameInfoMessage: GameInfoMessage = chooseWeightedRandom(
        await dbContext.kmq("game_messages")
    );

    const fields: Eris.EmbedField[] = [];
    if (gameInfoMessage) {
        fields.push({
            name: State.localizer.translate(
                messageContext.guildID,
                gameInfoMessage.title
            ),
            value: State.localizer.translate(
                messageContext.guildID,
                gameInfoMessage.message
            ),
            inline: false,
        });
    }

    const optionsEmbedPayload = await generateOptionsMessage(
        messageContext,
        guildPreference,
        null,
        false,
        false,
        null,
        true
    );

    await sendInfoMessage(
        messageContext,
        {
            title: startTitle,
            color: EMBED_SUCCESS_BONUS_COLOR,
            thumbnailUrl: KmqImages.HAPPY,
            fields,
        },
        false,
        true,
        undefined,
        [generateEmbed(messageContext, optionsEmbedPayload)]
    );
}

export default class MusicCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.notRestartingPrecheck },
        { checkFn: CommandPrechecks.premiumPrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    aliases = ["radio", "listen"];

    help = (guildID: string): HelpDocumentation => ({
        name: "music",
        description: State.localizer.translate(
            guildID,
            "command.music.help.description"
        ),
        usage: ",music",
        priority: 1040,
        examples: [
            {
                example: "`,music`",
                explanation: State.localizer.translate(
                    guildID,
                    "command.music.help.example"
                ),
            },
        ],
    });

    resetPremium = async (guildPreference: GuildPreference): Promise<void> => {
        const guildID = guildPreference.guildID;
        const session = Session.getSession(guildID);
        if (!session || session.isGameSession()) {
            return;
        }

        if (!session.isPremium()) {
            logger.info(
                `gid: ${guildID} | Music session ending, no longer premium.`
            );
            await session.endSession();
        }
    };

    call = async ({ message, channel }: CommandArgs): Promise<void> => {
        const messageContext = MessageContext.fromMessage(message);
        const guildID = message.guildID;
        const session = Session.getSession(guildID);
        if (session?.isGameSession()) {
            sendErrorMessage(messageContext, {
                title: "command.music.failure.existingGameSession.title",
                description: "command.music.failure.existingGameSession.title",
            });
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
        const textChannel = channel;
        const gameOwner = KmqMember.fromUser(message.author);
        const voiceChannel = getUserVoiceChannel(messageContext);
        if (!voiceChannel) {
            await sendErrorMessage(messageContext, {
                title: State.localizer.translate(
                    message.guildID,
                    "misc.failure.notInVC.title"
                ),
                description: State.localizer.translate(
                    message.guildID,
                    "misc.failure.notInVC.description",
                    { command: `\`${process.env.BOT_PREFIX}music\`` }
                ),
            });

            logger.warn(
                `${getDebugLogHeader(message)} | User not in voice channel`
            );
            return;
        }

        if (!voicePermissionsCheck(message)) {
            return;
        }

        const musicSession = new MusicSession(
            textChannel.id,
            voiceChannel.id,
            guildID,
            gameOwner
        );

        State.musicSessions[guildID] = musicSession;
        await sendBeginMusicSessionMessage(
            textChannel.name,
            voiceChannel.name,
            messageContext,
            guildPreference
        );

        musicSession.startRound(guildPreference, messageContext);
        logger.info(`${getDebugLogHeader(message)} | Music session starting`);
    };
}
