import {
    BOOKMARK_BUTTON_PREFIX,
    EMBED_SUCCESS_BONUS_COLOR,
} from "../constants";
import { IPCLogger } from "../logger";
import Eris from "eris";
import Round from "./round";
import type MessageContext from "./message_context";
import type PlayerRoundResult from "../interfaces/player_round_result";
import type QueriedSong from "./queried_song";
import type UniqueSongCounter from "../interfaces/unique_song_counter";

const logger = new IPCLogger("listening_round");

export default class ListeningRound extends Round {
    /** UUID associated with skip interaction custom_id */
    public interactionSkipUUID: string | null;

    constructor(song: QueriedSong, guildID: string) {
        super(song, guildID);
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
            interactionID.startsWith(BOOKMARK_BUTTON_PREFIX)
        );
    }

    async interactionSuccessfulSkip(): Promise<void> {
        if (!this.interactionMessage) return;
        this.interactionComponents = this.interactionComponents.map((x) => ({
            type: Eris.Constants.ComponentTypes.ACTION_ROW,
            components: x.components.map((y: Eris.InteractionButton) => ({
                ...y,
                style:
                    y.custom_id === this.interactionSkipUUID
                        ? Eris.Constants.ButtonStyles.SUCCESS
                        : y.style,
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
        this.interactionComponents = this.interactionComponents.map((row) => ({
            type: Eris.Constants.ComponentTypes.ACTION_ROW,
            components: row.components.map(
                (button: Eris.InteractionButton) => ({
                    ...button,
                    disabled: button.custom_id === this.interactionSkipUUID,
                }),
            ),
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
