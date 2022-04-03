import CommandPrechecks from "../../command_prechecks";
import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    getMention,
    getUserTag,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { bold } from "../../helpers/utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import GameSession from "../../structures/game_session";
import MessageContext from "../../structures/message_context";
import Player from "../../structures/player";
import TeamScoreboard from "../../structures/team_scoreboard";
import { GameType, GuildTextableMessage, ParsedMessage } from "../../types";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";

const logger = new IPCLogger("join");

export default class JoinCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.competitionPrecheck }];

    aliases = ["j"];

    call = async ({
        message,
        gameSessions,
        parsedMessage,
    }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            return;
        }

        JoinCommand.joinTeamsGame(message, parsedMessage, gameSession);
    };

    static joinTeamsGame(
        message: GuildTextableMessage,
        parsedMessage: ParsedMessage,
        gameSession: GameSession
    ): void {
        if (parsedMessage.components.length === 0) {
            logger.warn(`${getDebugLogHeader(message)} | Missing team name.`);
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.join.failure.joinError.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.join.failure.joinError.noTeamName.description",
                    { joinCommand: `${process.env.BOT_PREFIX}join` }
                ),
            });
            return;
        }

        // Limit length to 128 chars, filter out Discord markdown modifiers
        // Ignore: \ _ * ~ | `
        const teamName = parsedMessage.argument
            .replace(/\\|_|\*|~|\||`/gm, "")
            .substr(0, 128);

        // Don't allow emojis that aren't in this server
        // Emojis are of the format: <(a if animated):(alphanumeric):(number)>
        const emojis = teamName.match(/<a?:[a-zA-Z0-9]+:[0-9]+>/gm) || [];
        for (const emoji of emojis) {
            const emojiID = emoji
                .match(/(?<=<a?:[a-zA-Z0-9]+:)[0-9]+(?=>)/gm)
                .join("");

            if (
                !state.client.guilds
                    .get(message.guildID)
                    .emojis.map((e) => e.id)
                    .includes(emojiID)
            ) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(
                        message.guildID,
                        "command.join.failure.joinError.invalidTeamName.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "command.join.failure.joinError.badEmojis.description"
                    ),
                });

                logger.warn(
                    `${getDebugLogHeader(
                        message
                    )} | Team name contains unsupported characters.`
                );
                return;
            }
        }

        if (teamName.length === 0) {
            logger.info(
                `${getDebugLogHeader(
                    message
                )} | Team name contains unsupported characters.`
            );

            sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.join.failure.joinError.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.join.failure.joinError.invalidCharacters.description"
                ),
            });
            return;
        }

        const teamScoreboard = gameSession.scoreboard as TeamScoreboard;
        if (!teamScoreboard.hasTeam(teamName)) {
            teamScoreboard.addTeam(
                teamName,
                Player.fromUserID(message.author.id)
            );
            const teamNameWithCleanEmojis = teamName.replace(
                /(<a?)(:[a-zA-Z0-9]+:)([0-9]+>)/gm,
                (_p1, _p2, p3) => p3
            );

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.join.team.new"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.join.team.join",
                    {
                        teamName: bold(teamName),
                        mentionedUser: getMention(message.author.id),
                        joinCommand: `${process.env.BOT_PREFIX}join`,
                        teamNameWithCleanEmojis,
                        startGameInstructions: !gameSession.sessionInitialized
                            ? state.localizer.translate(
                                  message.guildID,
                                  "command.join.team.startGameInstructions",
                                  {
                                      beginCommand: `\`${process.env.BOT_PREFIX}begin\``,
                                  }
                              )
                            : "",
                    }
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            });

            logger.info(
                `${getDebugLogHeader(message)} | Team '${teamName}' created.`
            );
        } else {
            const team = teamScoreboard.getTeam(teamName);
            if (team.hasPlayer(message.author.id)) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: state.localizer.translate(
                        message.guildID,
                        "command.join.failure.joinError.title"
                    ),
                    description: state.localizer.translate(
                        message.guildID,
                        "command.join.failure.joinError.alreadyInTeam.description"
                    ),
                });

                logger.info(
                    `${getDebugLogHeader(
                        message
                    )} | Already joined team '${teamName}'.`
                );
                return;
            }

            teamScoreboard.addTeamPlayer(
                team.id,
                Player.fromUserID(message.author.id)
            );

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.join.playerJoinedTeam.title",
                    {
                        joiningUser: getUserTag(message.author),
                        teamName: team.name,
                    }
                ),
                description: !gameSession.sessionInitialized
                    ? state.localizer.translate(
                          message.guildID,
                          "command.join.playerJoinedTeam.beforeGameStart.description",
                          { beginCommand: `\`${process.env.BOT_PREFIX}begin\`` }
                      )
                    : state.localizer.translate(
                          message.guildID,
                          "command.join.playerJoinedTeam.afterGameStart.description",
                          {
                              mentionedUser: getMention(message.author.id),
                              teamName: bold(team.name),
                          }
                      ),
                thumbnailUrl: KmqImages.LISTENING,
            });

            logger.info(
                `${getDebugLogHeader(message)} | Successfully joined team '${
                    team.name
                }'.`
            );
        }
    }
}
