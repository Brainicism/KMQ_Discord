import { IPCLogger } from "../logger";
import { chooseRandom } from "../helpers/utils";
import {
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getMajorityCount,
    sendRoundMessage,
    tryCreateInteractionSuccessAcknowledgement,
} from "../helpers/discord_utils";
import { isSkipMajority, skipSong } from "../commands/game_commands/skip";
import { isUserPremium } from "../helpers/game_utils";
import KmqMember from "./kmq_member";
import ListeningRound from "./listening_round";
import LocalizationManager from "../helpers/localization_manager";
import Session from "./session";
import type Eris from "eris";
import type GuessResult from "../interfaces/guess_result";
import type GuildPreference from "./guild_preference";
import type MessageContext from "./message_context";
import type QueriedSong from "../interfaces/queried_song";
import type Round from "./round";

const logger = new IPCLogger("listening_session");

export default class ListeningSession extends Session {
    /** The current ListeningRound */
    public round: ListeningRound;

    constructor(
        guildPreference: GuildPreference,
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember
    ) {
        super(
            guildPreference,
            textChannelID,
            voiceChannelID,
            guildID,
            gameSessionCreator
        );
        this.round = null;
    }

    updateOwner(): void {
        if (this.finished) {
            return;
        }

        const voiceMembers = getCurrentVoiceMembers(this.voiceChannelID).filter(
            (x) => x.id !== process.env.BOT_CLIENT_ID
        );

        const voiceMemberIDs = new Set(voiceMembers.map((x) => x.id));
        if (voiceMemberIDs.has(this.owner.id) || voiceMemberIDs.size === 0) {
            return;
        }

        this.owner = new KmqMember(chooseRandom(voiceMembers).id);

        super.updateOwner();
    }

    // eslint-disable-next-line class-methods-use-this
    isListeningSession(): this is ListeningSession {
        return true;
    }

    // eslint-disable-next-line class-methods-use-this
    sessionName(): string {
        return "Listening Session";
    }

    /**
     * Starting a new ListeningRound
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(messageContext: MessageContext): Promise<boolean> {
        if (this.finished || this.round) {
            return false;
        }

        const startRoundResult = await super.startRound(messageContext);

        if (!startRoundResult) {
            return false;
        }

        if (messageContext) {
            const remainingDuration = this.getRemainingDuration(
                this.guildPreference
            );

            const startRoundMessage = await sendRoundMessage(
                messageContext,
                null,
                this,
                this.guildPreference.gameOptions.guessModeType,
                this.guildPreference.isMultipleChoiceMode(),
                remainingDuration,
                this.songSelector.getUniqueSongCounter(this.guildPreference)
            );

            this.round.interactionMessage = startRoundMessage;
            this.round.roundMessageID = startRoundMessage?.id;
            this.updateBookmarkSongList();
        }

        return true;
    }

    async endRound(
        messageContext?: MessageContext,
        guessResult?: GuessResult
    ): Promise<void> {
        await this.round?.interactionMarkButtons();
        super.endRound(messageContext, guessResult);
    }

    endSession(): Promise<void> {
        if (this.finished) {
            return;
        }

        this.finished = true;
        logger.info(
            `gid: ${this.guildID} | Listening session ended. rounds_played = ${this.roundsPlayed}`
        );
        super.endSession();
    }

    async handleComponentInteraction(
        interaction: Eris.ComponentInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        if (
            interaction.data.custom_id !== "bookmark" &&
            !this.handleInSessionInteractionFailures(
                interaction,
                messageContext
            )
        ) {
            return;
        }

        const guildID = interaction.guildID;
        if (interaction.data.custom_id === "bookmark") {
            this.handleBookmarkInteraction(interaction);
        } else if (
            interaction.data.custom_id === this.round.interactionSkipUUID
        ) {
            this.round.userSkipped(interaction.member.id);
            if (isSkipMajority(guildID, this)) {
                await this.round.interactionSuccessfulSkip();
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    LocalizationManager.localizer.translate(
                        guildID,
                        "misc.skip"
                    ),
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.skip.success.description",
                        {
                            skipCounter: `${this.round.getSkipCount()}/${getMajorityCount(
                                guildID
                            )}`,
                        }
                    )
                );

                skipSong(messageContext, this);
            } else {
                tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.skip.vote.title"
                    ),
                    LocalizationManager.localizer.translate(
                        guildID,
                        "command.skip.vote.description",
                        {
                            skipCounter: `${this.round.getSkipCount()}/${getMajorityCount(
                                guildID
                            )}`,
                        }
                    )
                );

                logger.info(
                    `${getDebugLogHeader(messageContext)} | Skip vote received.`
                );
            }
        }
    }

    /**
     * Whether the current listening session has premium features
     * @returns whether the session is premium
     */
    isPremium(): boolean {
        return getCurrentVoiceMembers(this.voiceChannelID).some((x) =>
            isUserPremium(x.id)
        );
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    // eslint-disable-next-line class-methods-use-this
    protected prepareRound(randomSong: QueriedSong): Round {
        return new ListeningRound(randomSong);
    }
}
