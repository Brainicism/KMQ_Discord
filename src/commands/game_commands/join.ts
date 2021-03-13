import BaseCommand, { CommandArgs } from "../base_command";
import { GameType } from "./play";
import GameSession from "../../structures/game_session";
import TeamScoreboard from "../../structures/team_scoreboard";
import Player from "../../structures/player";
import { GuildTextableMessage, ParsedMessage } from "../../types";
import { getUserTag, sendErrorMessage, sendInfoMessage, getMessageContext } from "../../helpers/discord_utils";
import { KmqImages } from "../../constants";
import { bold } from "../../helpers/utils";

export default class JoinCommand implements BaseCommand {
    aliases = ["j"];

    async call({ message, gameSessions, parsedMessage }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || gameSession.gameType === GameType.CLASSIC) {
            return;
        }
        if (gameSession.gameType === GameType.ELIMINATION) {
            this.joinEliminationGame(message, gameSession);
        } else if (gameSession.gameType === GameType.TEAMS) {
            this.joinTeamsGame(message, parsedMessage, gameSession);
        }
    }

    joinEliminationGame(message: GuildTextableMessage, gameSession: GameSession) {
        if (gameSession.participants.has(message.author.id)) {
            sendErrorMessage(getMessageContext(message), { title: "Player already joined", description: `${bold(getUserTag(message.author))} is already in the game.` });
            return;
        }

        if (gameSession.sessionInitialized) {
            const newPlayer = gameSession.addEliminationParticipant(message.author, true);
            sendInfoMessage(message, { title: "Joined Elimination Midgame", description: `\`${getUserTag(message.author)}\` has spawned with \`${newPlayer.getLives()}\` lives` });
            return;
        }

        let previouslyJoinedPlayers = gameSession.scoreboard.getPlayerNames().reverse();
        if (previouslyJoinedPlayers.length > 10) {
            previouslyJoinedPlayers = previouslyJoinedPlayers.slice(0, 10);
            previouslyJoinedPlayers.push("and many others...");
        }
        const players = `${bold(getUserTag(message.author))}, ${previouslyJoinedPlayers.join(", ")}`;
        sendInfoMessage(getMessageContext(message), { title: "Player joined", description: players });
        gameSession.addEliminationParticipant(message.author);
    }

    joinTeamsGame(message: GuildTextableMessage, parsedMessage: ParsedMessage, gameSession: GameSession) {
        if (parsedMessage.components.length === 0) {
            sendErrorMessage(getMessageContext(message), {
                title: "Join error",
                description: "Include a team name to create a team or to join that team if it already exists (`,join [team name]`)",
            });
            return;
        }
        // Limit length to 128 chars, filter out Discord markdown modifiers
        const teamName = parsedMessage.argument.replace(/\\|_|\*|~|\||`/gm, "").substr(0, 128);
        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (!teamScoreboard.hasTeam(teamName)) {
            teamScoreboard.addTeam(teamName, new Player(getUserTag(message.author), message.author.id, message.author.avatarURL, 0));
            sendInfoMessage(getMessageContext(message), {
                title: "New team created",
                description: `To join ${bold(teamName)} alongside ${bold(getUserTag(message.author))}, enter \`,join ${teamName}\`. Start the game with \`,begin\`.`,
                thumbnailUrl: KmqImages.READING_BOOK,
            });
        } else {
            const team = teamScoreboard.getTeam(teamName);
            if (team.hasPlayer(message.author.id)) {
                sendErrorMessage(getMessageContext(message), { title: "Join error", description: "You're already a member of this team." });
                return;
            }
            teamScoreboard.addPlayer(team.id, new Player(getUserTag(message.author), message.author.id, message.author.avatarURL, 0));
            sendInfoMessage(getMessageContext(message), {
                title: `${getUserTag(message.author)} joined ${team.name}`,
                description: !gameSession.sessionInitialized ? "When everyone has joined a team, `,begin` the game!"
                    : `${bold(getUserTag(message.author))} thinks they have what it takes to lead ${bold(team.name)} to victory!`,
                thumbnailUrl: KmqImages.LISTENING,
            });
        }
    }
}
