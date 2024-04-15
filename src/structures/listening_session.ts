import { IPCLogger } from "../logger";
import { chooseRandom } from "../helpers/utils";
import {
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getMajorityCount,
    tryCreateInteractionSuccessAcknowledgement,
} from "../helpers/discord_utils";
import { userBonusIsActive } from "../helpers/game_utils";
import KmqMember from "./kmq_member";
import ListeningRound from "./listening_round";
import Session from "./session";
import SkipCommand from "../commands/game_commands/skip";
import i18n from "../helpers/localization_manager";
import type Eris from "eris";
import type GuildPreference from "./guild_preference";
import type MessageContext from "./message_context";
import type QueriedSong from "./queried_song";
import type Round from "./round";

const logger = new IPCLogger("listening_session");

export default class ListeningSession extends Session {
    /** The current ListeningRound */
    public round: ListeningRound | null;

    constructor(
        guildPreference: GuildPreference,
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember,
    ) {
        super(
            guildPreference,
            textChannelID,
            voiceChannelID,
            guildID,
            gameSessionCreator,
        );
        this.round = null;
    }

    async updateOwner(): Promise<void> {
        if (this.finished) {
            return;
        }

        const voiceMembers = this.getVoiceMembers();

        const voiceMemberIDs = new Set(voiceMembers.map((x) => x.id));
        if (voiceMemberIDs.has(this.owner.id) || voiceMemberIDs.size === 0) {
            return;
        }

        this.owner = new KmqMember(chooseRandom(voiceMembers)!.id);

        await super.updateOwner();
    }

    isListeningSession(): this is ListeningSession {
        return true;
    }

    sessionName(): string {
        return "Listening Session";
    }

    getVoiceMembers(): Eris.Member[] {
        return getCurrentVoiceMembers(this.voiceChannelID).filter(
            (x) => x.id !== process.env.BOT_CLIENT_ID,
        );
    }

    /**
     * Starting a new ListeningRound
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(messageContext: MessageContext): Promise<Round | null> {
        if (this.finished || this.round) {
            return null;
        }

        const round = await super.startRound(messageContext);
        if (!round) {
            return null;
        }

        const remainingDuration = this.getRemainingDuration(
            this.guildPreference,
        );

        const embedColor = round.getEndRoundColor(
            false,
            await userBonusIsActive(messageContext.author.id),
        );

        const description = `${round.getEndRoundDescription(
            messageContext,
            this.guildPreference.songSelector.getUniqueSongCounter(),
            [],
        )}`;

        const startRoundMessage = await this.sendRoundMessage(
            messageContext,
            [],
            round,
            description,
            embedColor ?? undefined,
            false,
            remainingDuration,
        );

        round.interactionMessage = startRoundMessage;

        if (startRoundMessage) {
            this.updateBookmarkSongList(startRoundMessage.id, round.song);
        }

        return round;
    }

    async endRound(
        isError: boolean,
        messageContext?: MessageContext,
    ): Promise<void> {
        await this.round?.interactionMarkButtons();
        await super.endRound(isError, messageContext);
    }

    async endSession(reason: string): Promise<void> {
        if (this.finished) {
            return;
        }

        this.finished = true;
        logger.info(
            `gid: ${this.guildID} | Listening session ended. rounds_played = ${this.roundsPlayed}`,
        );
        await super.endSession(reason, false);
    }

    async handleComponentInteraction(
        interaction: Eris.ComponentInteraction,
        messageContext: MessageContext,
    ): Promise<boolean> {
        const interactionHandled = await super.handleComponentInteraction(
            interaction,
            messageContext,
        );

        if (interactionHandled) {
            return true;
        }

        if (!this.round) return false;
        if (
            interaction.data.custom_id !== "bookmark" &&
            !(await this.handleInSessionInteractionFailures(
                interaction,
                messageContext,
            ))
        ) {
            return true;
        }

        const round = this.round;
        const guildID = interaction.guildID as string;
        if (interaction.data.custom_id === "bookmark") {
            await this.handleBookmarkInteraction(interaction);
            return true;
        } else if (interaction.data.custom_id === round.interactionSkipUUID) {
            round.userSkipped(interaction.member!.id);
            if (SkipCommand.isSkipMajority(guildID, this)) {
                await round.interactionSuccessfulSkip();
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    i18n.translate(guildID, "misc.skip"),
                    i18n.translate(
                        guildID,
                        "command.skip.success.description",
                        {
                            skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                                guildID,
                            )}`,
                        },
                    ),
                );

                await SkipCommand.skipSong(messageContext, this);
                return true;
            } else {
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    i18n.translate(guildID, "command.skip.vote.title"),
                    i18n.translate(guildID, "command.skip.vote.description", {
                        skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                            guildID,
                        )}`,
                    }),
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Skip vote received.`,
                );

                return true;
            }
        }

        return false;
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    protected prepareRound(randomSong: QueriedSong): Round {
        return new ListeningRound(randomSong, this.guildID);
    }
}
