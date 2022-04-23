import BaseCommand from "../interfaces/base_command";
import GameSession from "../../structures/game_session";
import TeamScoreboard from "../../structures/team_scoreboard";
import Player from "../../structures/player";
import { GuildTextableMessage } from "../../types";
import {
    getUserTag,
    sendErrorMessage,
    sendInfoMessage,
    getMention,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { isFirstGameOfDay, isUserPremium } from "../../helpers/game_utils";
import { KmqImages } from "../../constants";
import { bold } from "../../helpers/utils";
import State from "../../state";
import MessageContext from "../../structures/message_context";
import CommandPrechecks from "../../command_prechecks";
import { IPCLogger } from "../../logger";
import Session from "../../structures/session";
import ParsedMessage from "../../interfaces/parsed_message";
import CommandArgs from "../../interfaces/command_args";
import { GameType } from "../../enums/game_type";

const logger = new IPCLogger("join");

export default class JoinCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notMusicPrecheck },
    ];

    aliases = ["j"];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const gameSession = Session.getSession(message.guildID) as GameSession;
        if (!gameSession || gameSession.gameType !== GameType.TEAMS) {
            return;
        }

        await JoinCommand.joinTeamsGame(message, parsedMessage, gameSession);
    };

    static async joinTeamsGame(
        message: GuildTextableMessage,
        parsedMessage: ParsedMessage,
        gameSession: GameSession
    ): Promise<void> {
        if (parsedMessage.components.length === 0) {
            logger.warn(`${getDebugLogHeader(message)} | Missing team name.`);
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: State.localizer.translate(
                    message.guildID,
                    "command.join.failure.joinError.title"
                ),
                description: State.localizer.translate(
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
            .substring(0, 128);

        // Don't allow emojis that aren't in this server
        // Emojis are of the format: <(a if animated):(alphanumeric):(number)>
        const emojis = teamName.match(/<a?:[a-zA-Z0-9]+:[0-9]+>/gm) || [];
        for (const emoji of emojis) {
            const emojiID = emoji
                .match(/(?<=<a?:[a-zA-Z0-9]+:)[0-9]+(?=>)/gm)
                .join("");

            if (
                !State.client.guilds
                    .get(message.guildID)
                    .emojis.map((e) => e.id)
                    .includes(emojiID)
            ) {
                sendErrorMessage(MessageContext.fromMessage(message), {
                    title: State.localizer.translate(
                        message.guildID,
                        "command.join.failure.joinError.invalidTeamName.title"
                    ),
                    description: State.localizer.translate(
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
                title: State.localizer.translate(
                    message.guildID,
                    "command.join.failure.joinError.title"
                ),
                description: State.localizer.translate(
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
                Player.fromUserID(
                    message.author.id,
                    0,
                    await isFirstGameOfDay(message.author.id),
                    await isUserPremium(message.author.id)
                )
            );
            const teamNameWithCleanEmojis = teamName.replace(
                /(<a?)(:[a-zA-Z0-9]+:)([0-9]+>)/gm,
                (_p1, _p2, p3) => p3
            );

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: State.localizer.translate(
                    message.guildID,
                    "command.join.team.new"
                ),
                description: State.localizer.translate(
                    message.guildID,
                    "command.join.team.join",
                    {
                        teamName: bold(teamName),
                        mentionedUser: getMention(message.author.id),
                        joinCommand: `${process.env.BOT_PREFIX}join`,
                        teamNameWithCleanEmojis,
                        startGameInstructions: !gameSession.sessionInitialized
                            ? State.localizer.translate(
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
                    title: State.localizer.translate(
                        message.guildID,
                        "command.join.failure.joinError.title"
                    ),
                    description: State.localizer.translate(
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
                Player.fromUserID(
                    message.author.id,
                    0,
                    await isFirstGameOfDay(message.author.id),
                    await isUserPremium(message.author.id)
                )
            );

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: State.localizer.translate(
                    message.guildID,
                    "command.join.playerJoinedTeam.title",
                    {
                        joiningUser: getUserTag(message.author),
                        teamName: team.name,
                    }
                ),
                description: !gameSession.sessionInitialized
                    ? State.localizer.translate(
                          message.guildID,
                          "command.join.playerJoinedTeam.beforeGameStart.description",
                          { beginCommand: `\`${process.env.BOT_PREFIX}begin\`` }
                      )
                    : State.localizer.translate(
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
