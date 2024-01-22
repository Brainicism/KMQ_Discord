import { IPCLogger } from "../logger";
import { chooseRandom } from "../helpers/utils";
import {
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getMajorityCount,
    tryCreateInteractionSuccessAcknowledgement,
} from "../helpers/discord_utils";
import { isSkipMajority, skipSong } from "../commands/game_commands/skip";
import { userBonusIsActive } from "../helpers/game_utils";
import KmqMember from "./kmq_member";
import ListeningRound from "./listening_round";
import Session from "./session";
import i18n from "../helpers/localization_manager";
import type Eris from "eris";
import type GuessResult from "../interfaces/guess_result";
import type GuildPreference from "./guild_preference";
import type MessageContext from "./message_context";
import type QueriedSong from "../interfaces/queried_song";
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

    updateOwner(): void {
        if (this.finished) {
            return;
        }

        const voiceMembers = this.getVoiceMembers();

        const voiceMemberIDs = new Set(voiceMembers.map((x) => x.id));
        if (voiceMemberIDs.has(this.owner.id) || voiceMemberIDs.size === 0) {
            return;
        }

        this.owner = new KmqMember(chooseRandom(voiceMembers)!.id);

        super.updateOwner();
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

        if (messageContext) {
            const remainingDuration = this.getRemainingDuration(
                this.guildPreference,
            );

            const embedColor = round.getEndRoundColor(
                false,
                await userBonusIsActive(messageContext.author.id),
            );

            const description = `${round.getEndRoundDescription(
                messageContext,
                this.songSelector.getUniqueSongCounter(this.guildPreference),
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
            round.roundMessageID = startRoundMessage?.id as string;
            this.updateBookmarkSongList(round);
        }

        return round;
    }

    async endRound(
        messageContext?: MessageContext,
        guessResult?: GuessResult,
    ): Promise<void> {
        await this.round?.interactionMarkButtons();
        await super.endRound(messageContext, guessResult);
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
    ): Promise<void> {
        if (!this.round) return;
        if (
            interaction.data.custom_id !== "bookmark" &&
            !this.handleInSessionInteractionFailures(
                interaction,
                messageContext,
            )
        ) {
            return;
        }

        const round = this.round;
        const guildID = interaction.guildID as string;
        if (interaction.data.custom_id === "bookmark") {
            await this.handleBookmarkInteraction(interaction);
        } else if (interaction.data.custom_id === round.interactionSkipUUID) {
            round.userSkipped(interaction.member!.id);
            if (isSkipMajority(guildID, this)) {
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

                skipSong(messageContext, this);
            } else {
                tryCreateInteractionSuccessAcknowledgement(
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
            }
        }
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    protected prepareRound(randomSong: QueriedSong): Round {
        return new ListeningRound(randomSong);
    }
}
