import {
    BOOKMARK_BUTTON_PREFIX,
    EMBED_SUCCESS_BONUS_COLOR,
    SKIP_BUTTON_PREFIX,
} from "../constants.js";
import { IPCLogger } from "../logger.js";
import * as Eris from "eris";
import Round from "./round.js";
import type MessageContext from "./message_context.js";
import type PlayerRoundResult from "../interfaces/player_round_result.js";
import type UniqueSongCounter from "../interfaces/unique_song_counter.js";

const logger = new IPCLogger("listening_round");

export default class ListeningRound extends Round {
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
     * @returns true if the given ID is one of the interactions (i.e. skip/bookmark) of the current round
     */
    isValidInteraction(interactionID: string): boolean {
        return (
            (interactionID.startsWith(SKIP_BUTTON_PREFIX) &&
                interactionID.includes(this.song.youtubeLink)) ||
            interactionID.startsWith(BOOKMARK_BUTTON_PREFIX)
        );
    }

    async interactionMarkButtons(): Promise<void> {
        if (!this.interactionMessage) return;
        this.interactionComponents = this.interactionComponents.map((row) => ({
            type: Eris.Constants.ComponentTypes.ACTION_ROW,
            components: row.components.map(
                (button: Eris.InteractionButton) => ({
                    ...button,
                    label:
                        button.custom_id.startsWith(SKIP_BUTTON_PREFIX) &&
                        this.getSkipCount() > 0
                            ? `${button.label} (${this.getSkipCount()})`
                            : button.label,
                    disabled: button.custom_id.startsWith(SKIP_BUTTON_PREFIX),
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
