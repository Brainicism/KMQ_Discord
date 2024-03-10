import { EMBED_SUCCESS_BONUS_COLOR } from "../constants";
import Round from "./round";
import type Eris from "eris";
import type MessageContext from "./message_context";
import type PlayerRoundResult from "../interfaces/player_round_result";
import type QueriedSong from "../interfaces/queried_song";
import type UniqueSongCounter from "../interfaces/unique_song_counter";
import { IPCLogger } from "../logger";
const logger = new IPCLogger("listening_round");

export default class ListeningRound extends Round {
    /** UUID associated with skip interaction custom_id */
    public interactionSkipUUID: string | null;

    constructor(song: QueriedSong) {
        super(song);
        this.interactionSkipUUID = null;
    }

    getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        _playerRoundResults: Array<PlayerRoundResult>,
    ): string {
        return this.getUniqueSongCounterMessage(
            messageContext,
            uniqueSongCounter,
        );
    }

    getEndRoundColor(
        _correctGuess: boolean,
        userBonusActive: boolean,
    ): number | null {
        if (userBonusActive) {
            return EMBED_SUCCESS_BONUS_COLOR;
        }

        return null;
    }

    /**
     * @param interactionID - the custom_id of an interaction
     * @returns true if the given UUID is one of the interactions (i.e. skip/bookmark) of the current game round
     */
    isValidInteraction(interactionID: string): boolean {
        return (
            interactionID === this.interactionSkipUUID ||
            interactionID === "bookmark"
        );
    }

    async interactionSuccessfulSkip(): Promise<void> {
        if (!this.interactionMessage) return;
        this.interactionComponents = this.interactionComponents.map((x) => ({
            type: 1,
            components: x.components.map((y: Eris.InteractionButton) => ({
                label: y.label,
                custom_id: y.custom_id,
                style: y.custom_id === this.interactionSkipUUID ? 3 : y.style,
                type: y.type,
                disabled: y.custom_id === this.interactionSkipUUID,
            })),
        }));

        try {
            await this.interactionMessage.edit({
                embeds: this.interactionMessage.embeds,
                components: this.interactionComponents,
            });
        } catch (e) {
            logger.warn(
                `Error editing interactionSuccessfulSkip interaction. gid = ${this.interactionMessage.guildID}. e = ${e}}`,
            );
        }
    }

    async interactionMarkButtons(): Promise<void> {
        if (!this.interactionMessage) return;
        this.interactionComponents = this.interactionComponents.map((x) => ({
            type: 1,
            components: x.components.map((y: Eris.InteractionButton) => ({
                label: y.label,
                custom_id: y.custom_id,
                style: y.style,
                type: y.type,
                disabled: y.custom_id === this.interactionSkipUUID,
            })),
        }));

        try {
            await this.interactionMessage.edit({
                embeds: this.interactionMessage.embeds,
                components: this.interactionComponents,
            });
        } catch (e) {
            logger.warn(
                `Error editing interactionMarkButtons interaction. gid = ${this.interactionMessage.guildID}. e = ${e}}`,
            );
        }
    }
}
