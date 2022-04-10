import { chooseRandom, delay } from "../helpers/utils";
import { QueriedSong } from "../types";
import {
    getCurrentVoiceMembers,
    sendRoundMessage,
} from "../helpers/discord_utils";
import KmqMember from "./kmq_member";
import Round from "./round";
import Session, { SONG_START_DELAY } from "./session";
import MusicRound from "./music_round";
import GuildPreference from "./guild_preference";
import MessageContext from "./message_context";
import { GuessResult } from "./game_session";
import { IPCLogger } from "../logger";
import { isUserPremium } from "../helpers/game_utils";

const logger = new IPCLogger("music_session");

export default class MusicSession extends Session {
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

        this.owner = KmqMember.fromUser(chooseRandom(voiceMembers));

        super.updateOwner();
    }

    /**
     * Starting a new MusicRound
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        await delay(SONG_START_DELAY);
        if (this.finished || this.round) {
            return;
        }

        await super.startRound(guildPreference, messageContext);

        if (messageContext) {
            const remainingDuration =
                this.getRemainingDuration(guildPreference);

            const endRoundMessage = await sendRoundMessage(
                messageContext,
                null,
                this,
                guildPreference.gameOptions.guessModeType,
                guildPreference.isMultipleChoiceMode(),
                remainingDuration,
                this.songSelector.getUniqueSongCounter(guildPreference)
            );

            // if message fails to send, no ID is returned
            this.round.roundMessageID = endRoundMessage?.id;
        }
    }

    async endRound(
        guildPreference: GuildPreference,
        messageContext?: MessageContext,
        guessResult?: GuessResult
    ): Promise<void> {
        super.endRound(guildPreference, messageContext, guessResult);
    }

    async endSession(): Promise<void> {
        if (this.finished) {
            return;
        }

        this.finished = true;
        logger.info(
            `gid: ${this.guildID} | Music session ended. rounds_played = ${this.roundsPlayed}`
        );
        super.endSession();
    }

    getListeners(): number {
        return getCurrentVoiceMembers(this.voiceChannelID).length;
    }

    /**
     * At least one premium member required to use a music session
     */
    verifyPremium(): void {
        if (
            !getCurrentVoiceMembers(this.voiceChannelID).some((x) =>
                isUserPremium(x.id)
            )
        ) {
            this.endSession();
        }
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    protected prepareRound(randomSong: QueriedSong): Round {
        return new MusicRound(randomSong);
    }
}
