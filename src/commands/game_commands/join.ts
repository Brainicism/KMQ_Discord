import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import GameSession from "../../structures/game_session";
import TeamScoreboard from "../../structures/team_scoreboard";
import Player from "../../structures/player";
import { GuildTextableMessage, ParsedMessage, GameType } from "../../types";
import { getUserTag, sendErrorMessage, sendInfoMessage, getMention, getDebugLogHeader } from "../../helpers/discord_utils";
import { KmqImages } from "../../constants";
import { bold } from "../../helpers/utils";
import { state } from "../../kmq_worker";
import MessageContext from "../../structures/message_context";
import KmqMember from "../../structures/kmq_member";
import CommandPrechecks from "../../command_prechecks";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("join");

export default class JoinCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["j"];

    call = async ({ message, gameSessions, parsedMessage }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || (gameSession.gameType !== GameType.ELIMINATION && gameSession.gameType !== GameType.TEAMS)) {
            return;
        }

        if (gameSession.gameType === GameType.ELIMINATION) {
            JoinCommand.joinEliminationGame(message, gameSession);
        } else if (gameSession.gameType === GameType.TEAMS) {
            JoinCommand.joinTeamsGame(message, parsedMessage, gameSession);
        }
    };

    static joinEliminationGame(message: GuildTextableMessage, gameSession: GameSession): void {
        const kmqMember = KmqMember.fromUser(message.author);
        if (gameSession.participants.has(message.author.id)) {
            logger.info(`${getDebugLogHeader(message)} | Player already in game.`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Player Already Joined", description: `${getMention(message.author.id)} is already in the game.` });
            return;
        }

        if (gameSession.sessionInitialized) {
            const newPlayer = gameSession.addEliminationParticipant(kmqMember, true);
            logger.info(`${getDebugLogHeader(message)} | Player has joined mid-elimination game.`);
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Joined Elimination Midgame", description: `\`${getMention(message.author.id)}\` has spawned with \`${newPlayer.getLives()}\` lives` });
            return;
        }

        let previouslyJoinedPlayers = gameSession.scoreboard.getPlayerMentions().reverse();
        if (previouslyJoinedPlayers.length > 10) {
            previouslyJoinedPlayers = previouslyJoinedPlayers.slice(0, 10);
            previouslyJoinedPlayers.push("and many others...");
        }

        const players = `${getMention(kmqMember.id)}, ${previouslyJoinedPlayers.join(", ")}`;
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Player Joined", description: players });
        logger.info(`${getDebugLogHeader(message)} | Player has joined.`);
        gameSession.addEliminationParticipant(kmqMember);
    }

    static joinTeamsGame(message: GuildTextableMessage, parsedMessage: ParsedMessage, gameSession: GameSession): void {
        if (parsedMessage.components.length === 0) {
            logger.warn(`${getDebugLogHeader(message)} | Missing team name.`);
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Join Error",
                description: "Include a team name to create a team or to join that team if it already exists (`,join [team name]`)",
            });
            return;
        }

        // Limit length to 128 chars, filter out Discord markdown modifiers
        // Ignore: \ _ * ~ | `
        const teamName = parsedMessage.argument.replace(/\\|_|\*|~|\||`/gm, "").substr(0, 128);
        // Don't allow emojis that aren't in this server
        // Emojis are of the format: <(a if animated):(alphanumeric):(number)>
        const emojis = teamName.match(/<a?:[a-zA-Z0-9]+:[0-9]+>/gm) || [];
        for (const emoji of emojis) {
            const emojiID = emoji.match(/(?<=<a?:[a-zA-Z0-9]+:)[0-9]+(?=>)/gm).join("");
            if (!state.client.guilds.get(message.guildID).emojis.map((e) => e.id).includes(emojiID)) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: "Invalid Team Name",
                    description: "You can only include emojis that are in this server.",
                });
                logger.warn(`${getDebugLogHeader(message)} | Team name contains unsupported characters.`);
                return;
            }
        }

        if (teamName.length === 0) {
            logger.info(`${getDebugLogHeader(message)} | Team name contains unsupported characters.`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Join Error", description: "Your team name consists of only invalid characters." });
            return;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (!teamScoreboard.hasTeam(teamName)) {
            teamScoreboard.addTeam(teamName, new Player(getUserTag(message.author), message.author.id, message.author.avatarURL, 0));
            const teamNameWithCleanEmojis = teamName.replace(/(<a?)(:[a-zA-Z0-9]+:)([0-9]+>)/gm, (p1, p2, p3) => p3);
            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "New Team Created",
                description: `To join ${bold(teamName)} alongside ${getMention(message.author.id)}, enter \`,join ${teamNameWithCleanEmojis}\`.${!gameSession.sessionInitialized ? " Start the game with `,begin`." : ""}`,
                thumbnailUrl: KmqImages.READING_BOOK,
            });
            logger.info(`${getDebugLogHeader(message)} | Team '${teamName}' created.`);
        } else {
            const team = teamScoreboard.getTeam(teamName);
            if (team.hasPlayer(message.author.id)) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Join Error", description: "You're already a member of this team." });
                logger.info(`${getDebugLogHeader(message)} | Already joined team '${teamName}'.`);
                return;
            }

            teamScoreboard.addPlayer(team.id, new Player(getUserTag(message.author), message.author.id, message.author.avatarURL, 0));
            sendInfoMessage(MessageContext.fromMessage(message), {
                title: `${getUserTag(message.author)} joined ${team.name}`,
                description: !gameSession.sessionInitialized ? "When everyone has joined a team, `,begin` the game!"
                    : `${getMention(message.author.id)} thinks they have what it takes to lead ${bold(team.name)} to victory!`,
                thumbnailUrl: KmqImages.LISTENING,
            });
            logger.info(`${getDebugLogHeader(message)} | Successfully joined team '${team.name}'.`);
        }
    }
}
