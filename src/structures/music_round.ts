import { EMBED_SUCCESS_BONUS_COLOR } from "../helpers/discord_utils";
import { PlayerRoundResult } from "../types";
import MessageContext from "./message_context";
import Round from "./round";
import { UniqueSongCounter } from "./song_selector";

export default class ListenRound extends Round {
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
}
