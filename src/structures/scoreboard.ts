import { IPCLogger } from "../logger";
import {
    ROUND_MAX_SCOREBOARD_PLAYERS,
    SCOREBOARD_FIELD_CUTOFF,
} from "../constants";
import { bold, friendlyFormattedNumber, getMention } from "../helpers/utils";
import { getCurrentVoiceMembers } from "../helpers/discord_utils";
import i18n from "../helpers/localization_manager";
import type GuildPreference from "./guild_preference";
import type Player from "./player";
import type SuccessfulGuessResult from "../interfaces/success_guess_result";

const logger = new IPCLogger("scoreboard");

export default class Scoreboard {
    /** Mapping of Discord user ID to Player */
    protected players: { [userID: string]: Player };

    /** The current players in first place */
    protected firstPlace: Array<Player>;

    /** The current highest score */
    protected highestScore: number;

    /** The ID of the voice channel the game is being played in, added purely for logging an edge case */
    private voiceChannelID: string;

    constructor(voiceChannelID: string) {
        this.players = {};
        this.firstPlace = [];
        this.highestScore = 0;
        this.voiceChannelID = voiceChannelID;
    }

    /**
     * @param player - Adds the given player to the scoreboard
     */
    addPlayer(player: Player): void {
        this.players[player.id] = player;
    }

    /**
     * @param guildID - The ID of the guild to get the scoreboard for
     * @returns a string congratulating the winner(s)
     */
    getWinnerMessage(guildID: string): string {
        let winnerStr = "";
        for (let i = 0; i < this.firstPlace.length; i++) {
            winnerStr += this.firstPlace[i].getDisplayedName(
                false,
                false,
                false,
            );
            if (i === this.firstPlace.length - 1) {
                // Last entry -- append just the username
                winnerStr += "";
            } else if (i === this.firstPlace.length - 2) {
                // Second last entry -- use "and"
                const and = i18n.translate(guildID, "misc.inGame.and");
                winnerStr += ` ${and} `;
            } else {
                // At least two more entries -- separate by ","
                winnerStr += ", ";
            }
        }

        return i18n.translateN(
            guildID,
            "misc.plural.winMessage",
            this.firstPlace.length,
            { player: winnerStr },
        );
    }

    getScoreboardEmbedFields(
        showExp: boolean,
        inProgress: boolean,
        guildID: string,
        roundWinnerIDs?: Array<string>,
    ): Array<{ name: string; value: string; inline: boolean }> {
        if (!this.shouldUseLargerScoreboard()) {
            return this.getScoreboardEmbedSingleColumn(
                showExp,
                inProgress,
                roundWinnerIDs,
            );
        }

        return this.getScoreboardEmbedThreeColumns(
            guildID,
            showExp,
            inProgress,
            roundWinnerIDs,
        );
    }

    /**
     * Updates the scoreboard with information about correct guessers
     * @param guessResults - Objects containing the user ID, points earned, and EXP gain
     */
    update(guessResults: Array<SuccessfulGuessResult>): void {
        const previousRoundRanking = this.getScoreToRankingMap();
        for (const player of Object.values(this.players)) {
            player.setPreviousRanking(previousRoundRanking[player.getScore()]);
        }

        for (const guessResult of guessResults) {
            if (!this.players[guessResult.userID]) {
                logger.warn(
                    `Player ${
                        guessResult.userID
                    } not found in scoreboard. Current voice channel members = ${getCurrentVoiceMembers(
                        this.voiceChannelID,
                    )
                        .map((x) => x.id)
                        .join(", ")}}`,
                );
                continue;
            }

            this.players[guessResult.userID].incrementScore(
                guessResult.pointsEarned,
            );

            this.players[guessResult.userID].incrementCorrectGuessCount();
            this.players[guessResult.userID].incrementExp(guessResult.expGain);

            const winnerScore = this.players[guessResult.userID].getScore();
            if (winnerScore === this.highestScore) {
                // If user is tied for first, add them to the first place array
                this.firstPlace.push(this.players[guessResult.userID]);
            } else if (winnerScore > this.highestScore) {
                // If user is first, reset first place array and add them
                this.highestScore = winnerScore;
                this.firstPlace = [this.players[guessResult.userID]];
            }
        }
    }

    /** @returns a list of the player currently in first place */
    getWinners(): Array<Player> {
        return this.firstPlace;
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @returns the score of the player
     */
    getPlayerScore(userID: string): number {
        return this.players[userID]?.getScore() ?? 0;
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @param boldScore - whether to display the score in bold
     * @returns the formatted score of the player
     */
    getPlayerDisplayedScore(userID: string, boldScore: boolean): string {
        return this.players[userID]?.getDisplayedScore(boldScore) ?? "0";
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @returns the formatted name of the player
     */
    getPlayerDisplayedName(userID: string): string {
        return (
            this.players[userID]?.getDisplayedName(false, false, true) ??
            getMention(userID)
        );
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @returns the exp gained by the player
     */
    getPlayerExpGain(userID: string): number {
        return this.players[userID]?.getExpGain() ?? 0;
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @returns the number of correct guesses by the player
     */
    getPlayerCorrectGuessCount(userID: string): number {
        return this.players[userID]?.getCorrectGuessCount() ?? 0;
    }

    /**
     * @param guildPreference - The GuildPreference
     * @returns whether the game has completed
     * */
    gameFinished(guildPreference: GuildPreference): boolean {
        return (
            guildPreference.isGoalSet() &&
            this.firstPlace.length > 0 &&
            this.firstPlace[0].getScore() >= guildPreference.gameOptions.goal
        );
    }

    /**
     *  @returns the number of players on the scoreboard
     * */
    getNumPlayers(): number {
        return Object.keys(this.players).length;
    }

    /** @returns a list of players participating in the game */
    getPlayers(): Array<Player> {
        return Object.values(this.players);
    }

    /** @returns a list of Discord IDs for those participating in the game */
    getPlayerIDs(): Array<string> {
        return Object.values(this.players).map((x) => x.id);
    }

    /**
     * Update whether a player is in VC
     * @param userID - The Discord user ID of the player to update
     * @param inVC - Whether the player is currently in the voice channel
     */
    setInVC(userID: string, inVC: boolean): void {
        const player = this.players[userID];
        if (player) {
            player.inVC = inVC;
        }
    }

    /**
     * @returns a mapping of player scores to ranking
     */
    getScoreToRankingMap(): { [score: number]: number } {
        const rankingToScore: { [score: number]: number } = {};
        const sortedUniqueScores = [
            ...new Set(Object.values(this.players).map((x) => x.getScore())),
        ].sort((a, b) => b - a);

        for (let i = 0; i < sortedUniqueScores.length; i++) {
            rankingToScore[sortedUniqueScores[i]] = i;
        }

        return rankingToScore;
    }

    /**
     * @returns whether to use the scoreboard designed for more players
     */
    shouldUseLargerScoreboard(): boolean {
        return (
            this.getPlayers().filter((x) => x.shouldIncludeInScoreboard())
                .length > SCOREBOARD_FIELD_CUTOFF
        );
    }

    /**
     * @param showExp - Whether to display the EXP gained in the game for each player
     * @param inProgress - Whether the game is in progress
     * @param roundWinnerIDs - The IDs of all players that won the current round, if any
     * @returns An array of DiscordEmbed fields representing each participant's score
     */
    getScoreboardEmbedSingleColumn(
        showExp: boolean,
        inProgress: boolean,
        roundWinnerIDs: Array<string> = [],
    ): Array<{ name: string; value: string; inline: boolean }> {
        const currentRanking = this.getScoreToRankingMap();
        return Object.values(this.players)
            .sort((a, b) => b.getScore() - a.getScore())
            .filter((x) => x.shouldIncludeInScoreboard())
            .map((x) => ({
                name: `${x.getRankingPrefix(
                    currentRanking[x.getScore()],
                    inProgress,
                )} ${x.getDisplayedName(
                    roundWinnerIDs && roundWinnerIDs[0] === x.id,
                    roundWinnerIDs?.includes(x.id),
                    false,
                )}`,
                value: `${x.getDisplayedScore()}${
                    showExp
                        ? ` (+${friendlyFormattedNumber(x.getExpGain())} EXP)`
                        : ""
                }`,
                inline: false,
            }));
    }

    getRemainingPlayers(
        correctGuessers: Array<{ id: string }>,
        incorrectGuessers: Set<string>,
    ): Array<Player> {
        return this.getPlayers()
            .filter((player) => player.inVC)
            .filter(
                (player) =>
                    !incorrectGuessers.has(player.id) &&
                    !correctGuessers.map((x) => x.id).includes(player.id),
            );
    }

    /**
     * Separates scoreboard players into two fields for large games
     * @param guildID - The guild ID
     * @param showExp - Whether to display the EXP gained in the game for each player
     * @param inProgress - Whether the game is in progress
     * @param roundWinnerIDs - The IDs of all players that won the current round, if any
     * @returns An array of 3 DiscordEmbed fields containing each player and their score, separated by newline
     */
    private getScoreboardEmbedThreeColumns(
        guildID: string,
        showExp: boolean,
        inProgress: boolean,
        roundWinnerIDs: Array<string> = [],
    ): Array<{ name: string; value: string; inline: boolean }> {
        const ZERO_WIDTH_SPACE = "​";
        const currentRanking = this.getScoreToRankingMap();
        const players = Object.values(this.players)
            .sort((a, b) => b.getScore() - a.getScore())
            .filter((x) => x.shouldIncludeInScoreboard())
            .slice(0, ROUND_MAX_SCOREBOARD_PLAYERS)
            .map(
                (x) =>
                    `${bold(
                        x.getRankingPrefix(
                            currentRanking[x.getScore()],
                            inProgress,
                        ),
                    )} ${x.getDisplayedName(
                        roundWinnerIDs && roundWinnerIDs[0] === x.id,
                        roundWinnerIDs?.includes(x.id),
                        true,
                    )}: ${x.getDisplayedScore()}${
                        showExp
                            ? ` (+${friendlyFormattedNumber(
                                  x.getExpGain(),
                              )} EXP)`
                            : ""
                    }`,
            );

        if (this.getNumPlayers() > ROUND_MAX_SCOREBOARD_PLAYERS) {
            players.push("\nand many others...");
        }

        return [
            {
                name: bold(
                    i18n.translate(guildID, "command.score.scoreboardTitle"),
                ),
                value: players
                    .slice(0, Math.ceil(players.length / 3))
                    .join("\n"),
                inline: false,
            },
            {
                name: ZERO_WIDTH_SPACE,
                value: players
                    .slice(
                        Math.ceil(players.length / 3),
                        Math.ceil((2 * players.length) / 3),
                    )
                    .join("\n"),
                inline: true,
            },
            {
                name: ZERO_WIDTH_SPACE,
                value: players
                    .slice(Math.ceil((2 * players.length) / 3))
                    .join("\n"),
                inline: true,
            },
        ];
    }
}
