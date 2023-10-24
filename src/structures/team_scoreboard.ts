import { IPCLogger } from "../logger";
import { SCOREBOARD_FIELD_CUTOFF } from "../constants";
import Scoreboard from "./scoreboard";
import Team from "./team";
import type Player from "./player";
import type SuccessfulGuessResult from "../interfaces/success_guess_result";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new IPCLogger("team_scoreboard");

interface TeamMap {
    [teamName: string]: Team;
}

export default class TeamScoreboard extends Scoreboard {
    /**
     * Mapping of team ID to Team
     * Note: Each "player" in this.players represents a team
     */
    protected players: TeamMap;

    constructor() {
        super();
        this.players = {};
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

        // give everybody EXP
        for (const guessResult of guessResults) {
            const correctGuesser = this.getPlayer(guessResult.userID);
            if (correctGuesser) {
                correctGuesser.incrementExp(guessResult.expGain);
            }
        }

        // first guesser gets the point for their team
        const firstGuessResult = guessResults[0];
        const firstCorrectGuesser = this.getPlayer(firstGuessResult.userID);

        if (firstCorrectGuesser) {
            firstCorrectGuesser.incrementScore(firstGuessResult.pointsEarned);
        }

        const correctGuesserTeam = this.getTeamOfPlayer(
            firstGuessResult.userID,
        );

        if (correctGuesserTeam) {
            const correctGuesserTeamScore = correctGuesserTeam.getScore();
            if (correctGuesserTeamScore === this.highestScore) {
                this.firstPlace.push(correctGuesserTeam);
            } else if (correctGuesserTeamScore > this.highestScore) {
                this.highestScore = correctGuesserTeamScore;
                this.firstPlace = [correctGuesserTeam];
            }
        }
    }

    /**
     * Create a new team with containing the player who created it
     * @param name - The name of the team
     * @param player - The player that created the team
     * @param guildID - The guild ID
     * @returns the newly created team
     */
    addTeam(name: string, player: Player, guildID: string): Team {
        // If the user is switching teams, remove them from their existing team first
        if (this.getPlayer(player.id)) {
            this.removePlayer(player.id);
        }

        this.players[name] = new Team(name, player, guildID);
        return this.players[name];
    }

    /**
     * @returns all teams
     */
    getTeams(): TeamMap {
        return this.players;
    }

    /**
     * @returns the number of teams
     */
    getNumTeams(): number {
        return super.getNumPlayers();
    }

    /**
     * @param name - The name of the team being accessed
     * @returns the Team corresponding to the given name, or null if it doesn't exist
     */
    getTeam(name: string): Team {
        return this.players[name] || null;
    }

    /**
     * @param name - The name of the team
     * @returns whether the Team is in first place (or tied for first)
     */
    isTeamFirstPlace(name: string): boolean {
        return this.firstPlace.includes(this.getTeam(name));
    }

    /**
     * @param name - The name of the team
     * @returns whether a team with the given name exists
     */
    hasTeam(name: string): boolean {
        return name in this.players;
    }

    /**
     * @param userID - The unique identifier of the player being searching for
     * @returns the team containing the given player
     */
    getTeamOfPlayer(userID: string): Team | null {
        return (
            Object.values(this.players).find((t: Team) =>
                t.hasPlayer(userID),
            ) || null
        );
    }

    /**
     * Adds a player to an existing team
     * @param teamName - The name of the team to add the player to
     * @param player - The player to add to the team
     */
    addTeamPlayer(teamName: string, player: Player): void {
        // If the user is switching teams, remove them from their existing team first
        this.removePlayer(player.id);
        this.players[teamName].addPlayer(player);
    }

    /**
     * Removes the given player from the team they are in (if they are in one)
     * If removing this player causes the team to have 0 members, destroy the team
     * @param userID - The unique identifier of the player to be deleted
     */
    removePlayer(userID: string): void {
        const team = this.getTeamOfPlayer(userID);
        if (!team) return;
        team.removePlayer(userID);
        if (team.getNumPlayers() === 0) {
            this.firstPlace = this.firstPlace.filter((t) => t !== team);
            delete this.players[team.getName()];
            // If the removed team was the only team in first, first place is now second place
            if (this.firstPlace.length === 0) {
                const highestScore = Math.max(
                    ...Object.values(this.players).map((x: Team) =>
                        x.getScore(),
                    ),
                    0,
                );

                if (highestScore === 0) return;
                this.firstPlace = Object.values(this.players).filter(
                    (t: Team) => t.getScore() === highestScore,
                );
            }
        }
    }

    /**
     * @param userID - The unique identifier of the player to find
     * @returns the player associated with the given userID, or null if it isn't in any of the teams
     */
    getPlayer(userID: string): Player | null {
        const teamOfPlayer = this.getTeamOfPlayer(userID);
        return teamOfPlayer ? teamOfPlayer.getPlayer(userID) : null;
    }

    /**
     * @param userID - The Discord user ID of the player whose exp is being accessed
     * @returns the exp gained by the player (with a 10% bonus to the winning team if there are multiple teams)
     */
    getPlayerExpGain(userID: string): number {
        const team = this.getTeamOfPlayer(userID);
        const player = this.getPlayer(userID);

        if (!player) {
            return 0;
        }

        if (!team) {
            logger.error(
                `getPlayerExpGain | Player ${player.id}  unexpectedly not part of a team`,
            );
            return 0;
        }

        if (
            this.isTeamFirstPlace(team.getName()) &&
            Object.keys(this.getTeams()).length > 1 &&
            this.firstPlace.length === 1
        ) {
            return player.getExpGain() * 1.1;
        }

        return player.getExpGain();
    }

    /**
     * @returns the score of the player associated with the given userID
     * @param userID - The unique identifier of the player whose score is being accessed
     */
    getPlayerScore(userID: string): number {
        const player = this.getPlayer(userID);
        if (player) {
            return player.getScore();
        }

        return 0;
    }

    /**
     * @param userID - The unique identifier of the player to get
     * @returns the player's tag
     */
    getPlayerName(userID: string): string | null {
        const player = this.getPlayer(userID);
        if (!player) {
            return null;
        }

        return player.getName();
    }

    /**
     * @returns all players in every team
     */
    getPlayers(): Array<Player> {
        return Object.values(this.players).flatMap((team) => team.getPlayers());
    }

    /**
     * @returns player IDs for players in every team
     */
    getPlayerIDs(): Array<string> {
        return this.getPlayers().map((x) => x.id);
    }

    /**
     * Update whether a player is in VC
     * @param userID - The Discord user ID of the player to update
     * @param inVC - Whether the player is currently in the voice channel
     */
    setInVC(userID: string, inVC: boolean): void {
        const player = this.getPlayer(userID);
        if (player) {
            player.inVC = inVC;
        }
    }

    /**
     * @returns whether to use the scoreboard designed for more players
     */
    shouldUseLargerScoreboard(): boolean {
        return this.getNumTeams() > SCOREBOARD_FIELD_CUTOFF;
    }
}
