import Eris from "eris";
import { EMBED_SUCCESS_BONUS_COLOR } from "../helpers/discord_utils";
import PlayerRoundResult from "../interfaces/player_round_result";
import QueriedSong from "../interfaces/queried_song";
import MessageContext from "./message_context";
import Round from "./round";
import { UniqueSongCounter } from "./song_selector";

export default class MusicRound extends Round {
    /** UUID associated with skip interaction custom_id */
    public interactionSkipUUID: string;

    constructor(song: QueriedSong) {
        super(song);
        this.interactionSkipUUID = null;
    }

    getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        _playerRoundResults: Array<PlayerRoundResult>
    ): string {
        return this.getUniqueSongCounterMessage(
            messageContext,
            uniqueSongCounter
        );
    }

    getEndRoundColor(_correctGuess: boolean, userBonusActive: boolean): number {
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

        await this.interactionMessage.edit({
            embeds: this.interactionMessage.embeds,
            components: this.interactionComponents,
        });
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

        await this.interactionMessage.edit({
            embeds: this.interactionMessage.embeds,
            components: this.interactionComponents,
        });
    }
}
