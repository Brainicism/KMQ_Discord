import Scoreboard from "./scoreboard";
import Player from "./player";
import Team from "./team";
import _logger from "../logger";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("team_scoreboard");

interface TeamMap {
    [teamName: string]: Team;
}

export default class TeamScoreboard extends Scoreboard {
    /**
    * Mapping of team ID to Team
    * Note: Each "player" in this.players represents a team
    */
    protected players: TeamMap;

    /** @returns An array of DiscordEmbed fields representing each participant's score */
    getScoreboardEmbedFields(): Array<{ name: string, value: string, inline: boolean }> {
        if (this.isEmpty()) return [];
        return super.getScoreboardEmbedFields();
    }

    /**
     * Reward points to the player that guessed correctly. Update the team in first place based on the new score
     * @param winnerTag - Unused
     * @param winnerID  - The Discord ID of the correct guesser
     * @param avatarURL - Unused
     * @param pointsEarned - The amount of points awarded
     * @param expGain - The amount of EXP gained
     */
    updateScoreboard(_winnerTag: string, winnerID: string, _avatarURL: string, pointsEarned: number, expGain: number) {
        const correctGuesser = this.getPlayer(winnerID);
        correctGuesser.incrementScore(pointsEarned);
        correctGuesser.incrementExp(expGain);
        const correctGuesserTeam = this.getTeamOfPlayer(winnerID);
        const correctGuesserTeamScore = correctGuesserTeam.getScore();
        if (correctGuesserTeamScore === this.highestScore) {
            this.firstPlace.push(correctGuesserTeam);
        } else if (correctGuesserTeamScore > this.highestScore) {
            this.highestScore = correctGuesserTeamScore;
            this.firstPlace = [correctGuesserTeam];
        }
    }

    /**
    * Create a new team with containing the player who created it
    * @param name - The name of the team
    * @param player - The player that created the team
    */
    addTeam(name: string, player: Player) {
        // If the user is switching teams, remove them from their existing team first
        if (this.getPlayer(player.id)) {
            this.removePlayer(player.id);
        }
        this.players[name] = new Team(name, player);
    }

    /**
     * @returns all teams
     */
    getTeams(): TeamMap {
        return this.players;
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
    getTeamOfPlayer(userID: string): Team {
        return Object.values(this.players).find((t: Team) => t.hasPlayer(userID)) || null;
    }

    /**
    * Adds a player to an existing team
    * @param teamName - The name of the team to add the player to
    * @param player - The player to add to the team
    */
    addPlayer(teamName: string, player: Player) {
        // If the user is switching teams, remove them from their existing team first
        this.removePlayer(player.id);
        this.players[teamName].addPlayer(player);
    }

    /**
     * Removes the given player from the team they are in (if they are in one)
     * If removing this player causes the team to have 0 members, destroy the team
     * @param userID - The unique identifier of the player to be deleted
     */
    removePlayer(userID: string) {
        const team = this.getTeamOfPlayer(userID);
        if (!team) return;
        team.removePlayer(userID);
        if (team.getNumPlayers() === 0) {
            this.firstPlace = this.firstPlace.filter((t: Team) => t !== team);
            delete this.players[team.name];
        }
    }

    /**
     * @param userID - The unique identifier of the player to find
     * @returns the player associated with the given userID, or null if it isn't in any of the teams
     */
    getPlayer(userID: string): Player {
        const teamOfPlayer = this.getTeamOfPlayer(userID);
        return teamOfPlayer ? teamOfPlayer.getPlayer(userID) : null;
    }

    /**
     * @param userID - The Discord user ID of the player whose exp is being accessed
     * @returns the exp gained by the player (with a 10% bonus to the winning team if there are multiple teams)
     */
    getPlayerExpGain(userID: string): number {
        if (this.isTeamFirstPlace(this.getTeamOfPlayer(userID).name) && Object.keys(this.getTeams()).length > 1 && this.firstPlace.length === 1) {
            return this.getPlayer(userID).getExpGain() * 1.1;
        }
        return this.getPlayer(userID).getExpGain();
    }

    /**
     * @returns the score of the player associated with the given userID
     */
    getPlayerScore(userID: string): number {
        const player = this.getPlayer(userID);
        if (player) {
            return player.getScore();
        }
        return 0;
    }

    /**
     * @returns the name of the player associated with the given userID
     */
    getPlayerName(userID: string): string {
        return this.getPlayer(userID).getName();
    }
}
