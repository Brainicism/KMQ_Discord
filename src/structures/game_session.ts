/* eslint-disable no-return-assign */
import * as uuid from "uuid";
import _ from "lodash";
import type Eris from "eris";

import {
    bold,
    chunkArray,
    codeLine,
    delay,
    getOrdinalNum,
    setDifference,
} from "../helpers/utils";
import {
    clickableSlashCommand,
    fetchUser,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getNumParticipants,
    getUserVoiceChannel,
    sendInfoMessage,
    sendPaginationedEmbed,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
    tryInteractionAcknowledge,
} from "../helpers/discord_utils";
import {
    getMultipleChoiceOptions,
    isFirstGameOfDay,
    userBonusIsActive,
} from "../helpers/game_utils";
import State from "../state";
import dbContext from "../database_context";

import {
    CUM_EXP_TABLE,
    ELIMINATION_DEFAULT_LIVES,
    EMBED_FIELDS_PER_PAGE,
    EMBED_SUCCESS_BONUS_COLOR,
    EMBED_SUCCESS_COLOR,
    KmqImages,
    REVIEW_LINK,
    VOTE_LINK,
} from "../constants";
import { IPCLogger } from "../logger";
import { sql } from "kysely";
import AnswerType from "../enums/option_types/answer_type";
import ClipAction from "../enums/clip_action";
import ClipGameRound from "./clip_game_round";
import EliminationPlayer from "./elimination_player";
import EliminationScoreboard from "./elimination_scoreboard";
import ExpCommand from "../commands/game_commands/exp";
import GameRound from "./game_round";
import GameType from "../enums/game_type";
import GuessModeType from "../enums/option_types/guess_mode_type";
import GuildPreference from "./guild_preference";
import KmqMember from "./kmq_member";
import MessageContext from "./message_context";
import MultiGuessType from "../enums/option_types/multiguess_type";
import Player from "./player";
import ProfileCommand from "../commands/game_commands/profile";
import Scoreboard from "./scoreboard";
import Session from "./session";
import TeamScoreboard from "./team_scoreboard";
import i18n from "../helpers/localization_manager";
import type { ButtonActionRow, GuildTextableMessage } from "../types";
import type { CommandInteraction } from "eris";
import type QueriedSong from "./queried_song";
import type Round from "./round";
import type SuccessfulGuessResult from "../interfaces/success_guess_result";

const HIDDEN_UPDATE_INTERVAL = 2000;

const logger = new IPCLogger("game_session");

interface LevelUpResult {
    userID: string;
    startLevel: number;
    endLevel: number;
}

interface LastGuesser {
    userID: string;
    streak: number;
}

export default class GameSession extends Session {
    /** The GameType that the GameSession started in */
    public readonly gameType: GameType;

    /** The Scoreboard object keeping track of players and scoring */
    public readonly scoreboard: Scoreboard;

    /** The current GameRound */
    public round: GameRound | null;

    /** The number of songs correctly guessed */
    private correctGuesses: number;

    /** List of guess times per GameRound */
    private guessTimes: Array<number>;

    /** Map of song's YouTube ID to its stats for this game session */
    private songStats: {
        [vlink: string]: {
            correctGuesses: number;
            roundsPlayed: number;
            skipCount: number;
            hintCount: number;
            timeToGuess: number;
            timePlayed: number;
        };
    };

    /** The most recent Guesser, including their current streak */
    private lastGuesser: LastGuesser | null;

    private hiddenUpdateTimer: NodeJS.Timeout | null;

    constructor(
        guildPreference: GuildPreference,
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember,
        gameType: GameType,
        eliminationLives?: number,
    ) {
        super(
            guildPreference,
            textChannelID,
            voiceChannelID,
            guildID,
            gameSessionCreator,
        );
        this.gameType = gameType;
        this.sessionInitialized = false;
        this.correctGuesses = 0;
        this.guessTimes = [];
        this.finished = false;
        this.round = null;
        this.songStats = {};
        this.lastGuesser = null;
        this.hiddenUpdateTimer = null;

        switch (this.gameType) {
            case GameType.TEAMS:
                this.scoreboard = new TeamScoreboard(voiceChannelID);
                break;
            case GameType.ELIMINATION:
                this.scoreboard = new EliminationScoreboard(
                    eliminationLives || ELIMINATION_DEFAULT_LIVES,
                    voiceChannelID,
                );
                break;
            default:
                this.scoreboard = new Scoreboard(voiceChannelID);
                break;
        }

        // eslint-disable-next-line @typescript-eslint/require-await
        this.guildPreference.answerTypeChangeCallback = async () => {
            const round = this.round;

            if (!round) return;
            if (this.isMultipleChoiceMode()) {
                logger.info(
                    `gid: ${this.guildID} | answerType changed to multiple choice, re-sending mc buttons`,
                );
                await this.sendMultipleChoiceOptionsMessage();
            } else if (this.isHiddenMode()) {
                logger.info(
                    `gid: ${this.guildID} | answerType changed to hidden, re-sending hidden message`,
                );

                await this.sendHiddenGuessMessage(
                    new MessageContext(this.textChannelID, null, this.guildID),
                    round,
                );
            } else {
                round.interactionMessage = null;
                await this.stopHiddenUpdateTimer();
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.syncAllVoiceMembers();
    }

    sessionName(): string {
        return "Game Session";
    }

    /**
     * Starting a new GameRound
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(messageContext: MessageContext): Promise<Round | null> {
        const isEndToEndBotRun =
            messageContext.author.id === process.env.END_TO_END_TEST_BOT_CLIENT;

        const multiGuessDelayMs = isEndToEndBotRun
            ? 0
            : this.guildPreference.getMultiGuessDelay() * 1000;

        const songStartDelayMs = isEndToEndBotRun
            ? 0
            : this.guildPreference.getSongStartDelay() * 1000;

        if (this.sessionInitialized) {
            // Only add a delay if the game has already started
            await delay(
                this.multiguessDelayIsActive(this.guildPreference)
                    ? Math.max(songStartDelayMs - multiGuessDelayMs, 0)
                    : songStartDelayMs,
            );
        }

        if (this.finished || this.round) {
            return null;
        }

        const round = await super.startRound(messageContext);

        if (!round) {
            return null;
        }

        if (this.isHiddenMode()) {
            // Show players that haven't guessed and a button to guess
            await this.sendHiddenGuessMessage(
                messageContext,
                round as GameRound,
            );
        } else if (this.isClipMode() && !this.isMultipleChoiceMode()) {
            await this.sendClipMessage(messageContext, round as GameRound);
        }

        if (this.isMultipleChoiceMode()) {
            await this.sendMultipleChoiceOptionsMessage();
        }

        return round;
    }

    /**
     * Ends an active GameRound
     * @param isError - Whether the round ended due to an error
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async endRound(
        isError: boolean,
        messageContext: MessageContext,
    ): Promise<void> {
        if (this.round === null) {
            return;
        }

        const round = this.round;

        if (round.songStartedAt === null) {
            return;
        }

        const correctGuessers = round.getCorrectGuessers(this.isHiddenMode());
        const isCorrectGuess = correctGuessers.length > 0;

        await this.stopHiddenUpdateTimer();

        await super.endRound(false, messageContext);

        try {
            await round.interactionMarkAnswers(correctGuessers.length || 0);
        } catch (e) {
            logger.warn(
                `Failed to mark interaction answers. Bot potentially left server? e = ${e}`,
            );
        }

        const timePlayed = Date.now() - round.songStartedAt;
        if (isCorrectGuess) {
            // update guessing streaks
            if (
                this.lastGuesser === null ||
                this.lastGuesser.userID !== correctGuessers[0]!.id
            ) {
                this.lastGuesser = {
                    userID: correctGuessers[0]!.id,
                    streak: 1,
                };
            } else {
                this.lastGuesser.streak++;
            }

            this.guessTimes.push(timePlayed);
            await this.updateScoreboard(
                round,
                this.guildPreference,
                messageContext,
            );
        } else if (!isError) {
            this.lastGuesser = null;
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this
                    .scoreboard as EliminationScoreboard;

                eliminationScoreboard.decrementAllLives();
            }
        }

        this.incrementSongStats(
            round.song.youtubeLink,
            isCorrectGuess,
            round.skipAchieved,
            round.hintUsed,
            timePlayed,
        );

        const remainingDuration = this.getRemainingDuration(
            this.guildPreference,
        );

        let roundResultIDs: Array<string>;
        const playerRoundResults = round.playerRoundResults;

        if (this.scoreboard instanceof TeamScoreboard) {
            const teamScoreboard = this.scoreboard as TeamScoreboard;
            roundResultIDs = playerRoundResults.map(
                (x) => teamScoreboard.getTeamOfPlayer(x.player.id)!.id,
            );
        } else {
            roundResultIDs = playerRoundResults.map((x) => x.player.id);
        }

        const useLargerScoreboard = this.scoreboard.shouldUseLargerScoreboard();

        const fields: Eris.EmbedField[] =
            this.scoreboard.getScoreboardEmbedFields(
                false,
                true,
                messageContext.guildID,
                roundResultIDs,
            );

        let scoreboardTitle = "";
        if (!useLargerScoreboard) {
            scoreboardTitle = "\n\n";
            scoreboardTitle += bold(
                i18n.translate(
                    messageContext.guildID,
                    "command.score.scoreboardTitle",
                ),
            );
        }

        const description = `${round.getEndRoundDescription(
            messageContext,
            this.guildPreference.songSelector.getUniqueSongCounter(),
            playerRoundResults,
            this.isHiddenMode(),
        )}${scoreboardTitle}`;

        const correctGuess = playerRoundResults.length > 0;
        const embedColor = round.getEndRoundColor(
            correctGuess,
            await userBonusIsActive(
                playerRoundResults[0]?.player.id ?? messageContext.author.id,
            ),
        );

        const endRoundMessage = await this.sendRoundMessage(
            messageContext,
            fields,
            round,
            description,
            embedColor,
            correctGuess && !this.isMultipleChoiceMode(),
            remainingDuration,
        );

        round.roundMessageID = endRoundMessage?.id as string;

        this.updateBookmarkSongList(round);

        if (this.scoreboard.gameFinished(this.guildPreference)) {
            await this.endSession("Game finished due to game options", false);
        } else if (this.gameType === GameType.SUDDEN_DEATH && !isCorrectGuess) {
            await this.endSession("Sudden death game ended", false);
        }
    }

    /**
     * Ends the current GameSession
     * @param reason - The reason for the game session end
     * @param endedDueToError - Whether the session ended due to an error
     */
    async endSession(reason: string, endedDueToError: boolean): Promise<void> {
        if (this.finished) {
            return;
        }

        this.finished = true;
        if (this.gameType === GameType.COMPETITION) {
            // log scoreboard
            logger.info("Scoreboard:");
            logger.info(
                JSON.stringify(
                    this.scoreboard
                        .getPlayers()
                        .sort((a, b) => b.getScore() - a.getScore())
                        .map((x) => ({
                            name: x.getName(),
                            id: x.id,
                            score: x.getDisplayedScore(),
                        })),
                ),
            );
        }

        const leveledUpPlayers: Array<LevelUpResult> =
            await this.updatePlayerStats(endedDueToError);

        // send level up message
        if (leveledUpPlayers.length > 0) {
            const levelUpMessages = leveledUpPlayers
                .sort((a, b) => b.endLevel - a.endLevel)
                .sort(
                    (a, b) =>
                        b.endLevel - b.startLevel - (a.endLevel - a.startLevel),
                )
                .map((leveledUpPlayer) =>
                    i18n.translate(this.guildID, "misc.levelUp.entry", {
                        user: this.scoreboard.getPlayerDisplayedName(
                            leveledUpPlayer.userID,
                        ),
                        startLevel: codeLine(
                            String(leveledUpPlayer.startLevel),
                        ),
                        endLevel: codeLine(String(leveledUpPlayer.endLevel)),
                        rank: codeLine(
                            ProfileCommand.getRankNameByLevel(
                                leveledUpPlayer.endLevel,
                                this.guildID,
                            ),
                        ),
                    }),
                )
                .slice(0, 10);

            if (leveledUpPlayers.length > 10) {
                levelUpMessages.push(
                    i18n.translate(this.guildID, "misc.andManyOthers"),
                );
            }

            await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    title: i18n.translate(this.guildID, "misc.levelUp.title"),
                    description: levelUpMessages.join("\n"),
                    thumbnailUrl: KmqImages.THUMBS_UP,
                },
            );
        }

        // commit guild's game session
        const sessionLength = (Date.now() - this.startedAt) / (1000 * 60);
        const averageGuessTime =
            this.guessTimes.length > 0
                ? this.guessTimes.reduce((a, b) => a + b, 0) /
                  (this.guessTimes.length * 1000)
                : -1;

        await this.persistGameSession(averageGuessTime, sessionLength);

        // commit session's song plays and correct guesses
        if (!this.isMultipleChoiceMode()) {
            await this.storeSongStats();
        }

        await super.endSession(reason, endedDueToError);
        await this.sendEndGameMessage();

        logger.info(
            `gid: ${this.guildID} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`,
        );
    }

    /**
     * Process a message to see if it is a valid and correct guess
     * @param messageContext - The context of the message to check
     * @param guess - the content of the message to check
     * @param createdAt - the time the guess was made
     */
    async guessSong(
        messageContext: MessageContext,
        guess: string,
        createdAt: number,
    ): Promise<void> {
        if (!this.connection) return;
        if (this.connection.listenerCount("end") === 0) return;
        if (!this.round) return;
        if (!this.guessEligible(messageContext, createdAt)) return;

        const round = this.round;
        const pointsEarned = this.checkGuess(
            messageContext.author.id,
            guess,
            createdAt,
            this.guildPreference.gameOptions.guessModeType,
            this.isMultipleChoiceMode(),
            this.guildPreference.typosAllowed(),
        );

        const correctGuessers = round.getCorrectGuessers(this.isHiddenMode());
        const incorrectGuessers = round.getIncorrectGuessers();
        if (this.isHiddenMode()) {
            // Determine whether to wait for more guesses
            if (
                this.scoreboard.getRemainingPlayers(
                    correctGuessers.map((x) => x.id),
                    incorrectGuessers,
                ).length > 0
            ) {
                // If there are still players who haven't guessed correctly, don't end the round
                return;
            } else {
                // Everyone guessed, end the round
                await this.stopHiddenUpdateTimer();
            }
        }

        if (
            pointsEarned > 0 ||
            (this.isHiddenMode() && correctGuessers.length > 0)
        ) {
            // If not hidden, someone guessed correctly
            // If hidden, everyone guessed and at least one person was right
            if (round.finished) {
                return;
            }

            round.finished = true;
            await delay(
                this.multiguessDelayIsActive(this.guildPreference)
                    ? this.guildPreference.getMultiGuessDelay() * 1000
                    : 0,
            );

            // mark round as complete, so no more guesses can go through
            await this.endRound(false, messageContext);
            this.correctGuesses++;

            // update game session's lastActive
            await this.lastActiveNow();

            this.stopGuessTimeout();

            await this.incrementGuildSongGuessCount();

            await this.startRound(messageContext);
        } else if (this.isMultipleChoiceMode() || this.isHiddenMode()) {
            // If hidden or multiple choice, everyone guessed and no one was right
            if (
                setDifference(
                    [
                        ...new Set(
                            getCurrentVoiceMembers(this.voiceChannelID).map(
                                (x) => x.id,
                            ),
                        ),
                    ],
                    [...incorrectGuessers],
                ).size === 0
            ) {
                await this.endRound(
                    false,
                    new MessageContext(this.textChannelID, null, this.guildID),
                );

                await this.startRound(messageContext);
            }
        }
    }

    getCorrectGuesses(): number {
        return this.correctGuesses;
    }

    isGameSession(): this is GameSession {
        return true;
    }

    /** Updates owner to the first player to join the game that didn't leave VC */
    async updateOwner(): Promise<void> {
        if (this.finished) {
            return;
        }

        const voiceMembers = getCurrentVoiceMembers(this.voiceChannelID).filter(
            (x) => x.id !== process.env.BOT_CLIENT_ID,
        );

        const voiceMemberIDs = new Set(voiceMembers.map((x) => x.id));
        if (voiceMemberIDs.has(this.owner.id) || voiceMemberIDs.size === 0) {
            return;
        }

        const participantsInVC = this.scoreboard
            .getPlayerIDs()
            .filter((p) => voiceMemberIDs.has(p));

        // Pick the first participant still in VC
        const newOwnerID = participantsInVC[0];

        // nobody left in vc
        if (!newOwnerID) {
            return;
        }

        this.owner = new KmqMember(newOwnerID);

        await super.updateOwner();
    }

    async handleComponentInteraction(
        interaction: Eris.ComponentInteraction<Eris.TextableChannel>,
        messageContext: MessageContext,
    ): Promise<void> {
        if (
            !(await this.handleInSessionInteractionFailures(
                interaction,
                messageContext,
            ))
        ) {
            return;
        }

        if (!this.round) return;
        const round = this.round;

        if (
            this.isClipMode() &&
            Object.values(ClipAction).includes(
                interaction.data.custom_id as ClipAction,
            )
        ) {
            if (
                Date.now() - round.songStartedAt! <
                this.guildPreference.gameOptions.guessTimeout! * 1000
            ) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    i18n.translate(
                        this.guildID,
                        "misc.failure.interaction.clipActionTooEarly.title",
                    ),
                    i18n.translate(
                        this.guildID,
                        "misc.failure.interaction.clipActionTooEarly.description",
                    ),
                );
                return;
            }

            const clipRound = round as ClipGameRound;
            const clipAction = interaction.data.custom_id as ClipAction;
            switch (clipAction) {
                case ClipAction.REPLAY:
                    clipRound.replayRequested(messageContext.author.id);
                    if (clipRound.isReplayMajority()) {
                        await tryCreateInteractionSuccessAcknowledgement(
                            interaction,
                            i18n.translate(
                                this.guildID,
                                "misc.replay.success.title",
                            ),
                            i18n.translate(
                                this.guildID,
                                "misc.replay.success.description",
                            ),
                            true,
                        );

                        await this.playSong(messageContext, clipAction);
                        clipRound.resetRequesters();
                    } else {
                        await tryCreateInteractionSuccessAcknowledgement(
                            interaction,
                            i18n.translate(
                                this.guildID,
                                "misc.replay.requested.title",
                            ),
                            i18n.translate(
                                this.guildID,
                                "misc.replay.requested.description",
                            ),
                            true,
                        );
                    }

                    break;
                case ClipAction.NEW_CLIP:
                    clipRound.newClipRequested(messageContext.author.id);
                    if (clipRound.isNewClipMajority()) {
                        await tryCreateInteractionSuccessAcknowledgement(
                            interaction,
                            i18n.translate(
                                this.guildID,
                                "misc.newClip.success.title",
                            ),
                            i18n.translate(
                                this.guildID,
                                "misc.newClip.success.description",
                            ),
                            true,
                        );

                        await this.playSong(messageContext, clipAction);
                        clipRound.resetRequesters();
                    } else {
                        await tryCreateInteractionSuccessAcknowledgement(
                            interaction,
                            i18n.translate(
                                this.guildID,
                                "misc.newClip.requested.title",
                            ),
                            i18n.translate(
                                this.guildID,
                                "misc.newClip.requested.description",
                            ),
                            true,
                        );
                    }

                    break;
                default:
                    logger.warn(
                        `gid: ${this.guildID} | Invalid clip action: ${clipAction}`,
                    );
                    break;
            }
        } else {
            if (
                round.getIncorrectGuessers().has(interaction.member!.id) ||
                !this.guessEligible(messageContext, interaction.createdAt)
            ) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    null,
                    i18n.translate(
                        this.guildID,
                        "misc.failure.interaction.alreadyEliminated",
                    ),
                );
                return;
            }

            if (!round.isCorrectInteractionAnswer(interaction.data.custom_id)) {
                await tryCreateInteractionErrorAcknowledgement(
                    interaction,
                    null,
                    i18n.translate(
                        this.guildID,
                        "misc.failure.interaction.eliminated",
                    ),
                );

                round.interactionIncorrectAnswerUUIDs[
                    interaction.data.custom_id
                ]++;

                // Add the user as a participant
                await this.guessSong(messageContext, "", interaction.createdAt);
                return;
            }

            await tryInteractionAcknowledge(interaction);

            const guildPreference = await GuildPreference.getGuildPreference(
                messageContext.guildID,
            );

            await this.guessSong(
                messageContext,
                guildPreference.gameOptions.guessModeType !==
                    GuessModeType.ARTIST
                    ? round.song.songName
                    : round.song.artistName,
                interaction.createdAt,
            );
        }
    }

    /**
     * Update whether a player is in VC
     * @param userID - The Discord user ID of the player to update
     * @param inVC - Whether the player is currently in the voice channel
     */
    async setPlayerInVC(userID: string, inVC: boolean): Promise<void> {
        const user = await fetchUser(userID);
        if (
            inVC &&
            !this.scoreboard.getPlayerIDs().includes(userID) &&
            this.gameType !== GameType.TEAMS
        ) {
            this.scoreboard.addPlayer(
                this.gameType === GameType.ELIMINATION
                    ? EliminationPlayer.fromUser(
                          user as Eris.User,
                          this.guildID,
                          (
                              this.scoreboard as EliminationScoreboard
                          ).getLivesOfWeakestPlayer(),
                          await isFirstGameOfDay(userID),
                      )
                    : Player.fromUser(
                          user as Eris.User,
                          this.guildID,
                          0,
                          await isFirstGameOfDay(userID),
                      ),
            );
        }

        this.scoreboard.setInVC(userID, inVC);
    }

    /**
     * Add all players in VC that aren't tracked to the scoreboard, and update those who left
     */
    async syncAllVoiceMembers(): Promise<void> {
        const currentVoiceMemberIds = getCurrentVoiceMembers(
            this.voiceChannelID,
        ).map((x) => x.id);

        await Promise.allSettled(
            this.scoreboard
                .getPlayerIDs()
                .filter((x) => !currentVoiceMemberIds.includes(x))
                .map(async (player) => {
                    await this.setPlayerInVC(player, false);
                }),
        );

        if (this.gameType === GameType.TEAMS) {
            // Players join teams manually with /join
            return;
        }

        await Promise.allSettled(
            currentVoiceMemberIds
                .filter((x) => x !== process.env.BOT_CLIENT_ID)
                .map(async (playerId) => {
                    const firstGameOfDay = await isFirstGameOfDay(playerId);
                    const player = (await fetchUser(playerId)) as Eris.User;
                    this.scoreboard.addPlayer(
                        this.gameType === GameType.ELIMINATION
                            ? EliminationPlayer.fromUser(
                                  player,
                                  this.guildID,
                                  (this.scoreboard as EliminationScoreboard)
                                      .startingLives,
                                  firstGameOfDay,
                              )
                            : Player.fromUser(
                                  player,
                                  this.guildID,
                                  0,
                                  firstGameOfDay,
                              ),
                    );
                }),
        );
    }

    /**
     * Sends an embed displaying the scoreboard of the GameSession
     * @param messageOrInteraction - Message/interaction to get user/server info from
     * @returns the message
     */
    sendScoreboardMessage(
        messageOrInteraction: GuildTextableMessage | CommandInteraction,
    ): Promise<Eris.Message | null> {
        const winnersFieldSubsets = chunkArray(
            this.scoreboard.getScoreboardEmbedSingleColumn(true, true),
            EMBED_FIELDS_PER_PAGE,
        );

        let footerText = i18n.translate(
            messageOrInteraction.guildID as string,
            "misc.classic.yourScore",
            {
                score: String(
                    this.scoreboard.getPlayerDisplayedScore(
                        messageOrInteraction.member!.id,
                        false,
                    ),
                ),
            },
        );

        if (this.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = this
                .scoreboard as EliminationScoreboard;

            footerText = i18n.translate(
                messageOrInteraction.guildID as string,
                "misc.elimination.yourLives",
                {
                    lives: String(
                        eliminationScoreboard.getPlayerLives(
                            messageOrInteraction.member!.id,
                        ),
                    ),
                },
            );
        } else if (this.gameType === GameType.TEAMS) {
            const teamScoreboard = this.scoreboard as TeamScoreboard;
            footerText = i18n.translate(
                messageOrInteraction.guildID as string,
                "misc.team.yourTeamScore",
                {
                    teamScore: String(
                        teamScoreboard
                            .getTeamOfPlayer(messageOrInteraction.member!.id)
                            ?.getScore(),
                    ),
                },
            );
            footerText += "\n";
            footerText += i18n.translate(
                messageOrInteraction.guildID as string,
                "misc.team.yourScore",
                {
                    score: String(
                        teamScoreboard.getPlayerScore(
                            messageOrInteraction.member!.id,
                        ),
                    ),
                },
            );
        }

        const embeds: Array<Eris.EmbedOptions> = winnersFieldSubsets.map(
            (winnersFieldSubset) => ({
                color: EMBED_SUCCESS_COLOR,
                title: i18n.translate(
                    messageOrInteraction.guildID as string,
                    "command.score.scoreboardTitle",
                ),
                fields: winnersFieldSubset,
                footer: {
                    text: footerText,
                },
            }),
        );

        return sendPaginationedEmbed(messageOrInteraction, embeds);
    }

    /**
     * Sends an embed displaying the winner of the session as well as the scoreboard
     */
    async sendEndGameMessage(): Promise<void> {
        const footerText = i18n.translate(
            this.guildID,
            "misc.inGame.songsCorrectlyGuessed",
            {
                songCount: `${this.getCorrectGuesses()}/${this.getRoundsPlayed()}`,
            },
        );

        if (this.scoreboard.getWinners().length === 0) {
            await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    title: i18n.translate(
                        this.guildID,
                        "misc.inGame.noWinners",
                    ),
                    footerText,
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
            );
        } else {
            const winners = this.scoreboard.getWinners();
            const useLargerScoreboard =
                this.scoreboard.shouldUseLargerScoreboard();

            const fields = this.scoreboard.getScoreboardEmbedFields(
                this.gameType !== GameType.TEAMS,
                false,
                this.guildID,
            );

            const endGameMessage = await getGameInfoMessage(this.guildID);

            if (
                endGameMessage &&
                endGameMessage.title &&
                endGameMessage.message
            ) {
                fields.push({
                    name: endGameMessage.title,
                    value: endGameMessage.message,
                    inline: false,
                });
            } else {
                logger.warn(
                    `Failed fetching end game message. guildID = ${
                        this.guildID
                    }. locale = ${State.getGuildLocale(
                        this.guildID,
                    )} endGameMessage =${!!endGameMessage}, endGameMessage.title=${!!endGameMessage?.title}, endGameMessage.message=${!!endGameMessage?.message}`,
                );
            }

            const winnerMessage =
                this.gameType === GameType.SUDDEN_DEATH
                    ? i18n.translateN(
                          this.guildID,
                          "misc.plural.suddenDeathEnd",
                          this.roundsPlayed - 1,
                      )
                    : this.scoreboard.getWinnerMessage(
                          State.getGuildLocale(this.guildID),
                      );

            await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    color:
                        this.gameType !== GameType.TEAMS &&
                        (await userBonusIsActive(winners[0]!.id))
                            ? EMBED_SUCCESS_BONUS_COLOR
                            : EMBED_SUCCESS_COLOR,
                    description: !useLargerScoreboard
                        ? bold(
                              i18n.translate(
                                  this.guildID,
                                  "command.score.scoreboardTitle",
                              ),
                          )
                        : undefined,
                    thumbnailUrl: winners[0]!.getAvatarURL(),
                    title: `🎉 ${winnerMessage} 🎉`,
                    fields,
                    footerText,
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    style: 5,
                                    url: VOTE_LINK,
                                    type: 2 as const,
                                    emoji: { name: "✅", id: null },
                                    label: i18n.translate(
                                        this.guildID,
                                        "misc.interaction.vote",
                                    ),
                                },
                                {
                                    style: 5,
                                    url: REVIEW_LINK,
                                    type: 2 as const,
                                    emoji: { name: "📖", id: null },
                                    label: i18n.translate(
                                        this.guildID,
                                        "misc.interaction.leaveReview",
                                    ),
                                },
                                {
                                    style: 5,
                                    url: "https://discord.gg/RCuzwYV",
                                    type: 2,
                                    emoji: { name: "🎵", id: null },
                                    label: i18n.translate(
                                        this.guildID,
                                        "misc.interaction.officialKmqServer",
                                    ),
                                },
                            ],
                        },
                    ],
                },
            );
        }
    }

    async updateGuessedMembersMessage(): Promise<void> {
        const round = this.round;
        if (
            this.finished ||
            !round ||
            round.finished ||
            !round.interactionMessageNeedsUpdate
        ) {
            return;
        }

        round.interactionMessageNeedsUpdate = false;
        const interactionMessage = round.interactionMessage;
        if (interactionMessage) {
            try {
                await interactionMessage.edit({
                    embeds: [
                        {
                            ...this.generateRemainingPlayersMessage(round),
                            thumbnail: { url: KmqImages.THUMBS_UP },
                        },
                    ],
                });
            } catch (e) {
                logger.warn(
                    `Error editing updateGuessedMembersMessage interaction. gid = ${this.guildID}. e = ${e}}`,
                );
            }
        }
    }

    /** @returns if multiple choice mode is active */
    isMultipleChoiceMode(): boolean {
        return this.guildPreference.isMultipleChoiceMode();
    }

    /** @returns if hidden mode is active */
    isHiddenMode(): boolean {
        return this.guildPreference.isHiddenMode();
    }

    /** @returns if clip mode is active */
    isClipMode(): boolean {
        return this.gameType === GameType.CLIP;
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    protected prepareRound(randomSong: QueriedSong): Round {
        const gameRound = this.isClipMode()
            ? new ClipGameRound(
                  randomSong,
                  this.calculateBaseExp(),
                  this.guildID,
              )
            : new GameRound(randomSong, this.calculateBaseExp());

        return gameRound;
    }

    /**
     *
     * @param userID - The user ID of the user guessing
     * @param guess - The user's guess
     * @param createdAt - The time the guess was made
     * @param guessModeType - The guessing mode type to evaluate the guess against
     * @param multipleChoiceMode - Whether the answer type is set to multiple choice
     * @param typosAllowed - Whether minor typos are allowed
     * @returns The number of points achieved for the guess
     */
    private checkGuess(
        userID: string,
        guess: string,
        createdAt: number,
        guessModeType: GuessModeType,
        multipleChoiceMode: boolean,
        typosAllowed = false,
    ): number {
        if (!this.round) return 0;
        const round = this.round;
        const incorrectGuessers = round.getIncorrectGuessers();
        if (multipleChoiceMode && incorrectGuessers.has(userID)) return 0;

        if (
            !round
                .getCorrectGuessers(this.isHiddenMode())
                .map((x) => x.id)
                .includes(userID) &&
            !incorrectGuessers.has(userID)
        ) {
            if (round.interactionMessage) {
                round.interactionMessageNeedsUpdate = true;
            }
        }

        round.storeGuess(userID, guess, createdAt, guessModeType, typosAllowed);

        const pointsAwarded = round.checkGuess(
            guess,
            guessModeType,
            typosAllowed,
        );

        if (
            !typosAllowed &&
            pointsAwarded === 0 &&
            round.isSimilarGuess(guess, guessModeType) &&
            Math.random() < 0.05
        ) {
            round.warnTypoReceived = true;
        }

        return pointsAwarded;
    }

    /**
     * Checks whether the author of the message is eligible to guess in the
     * current game session
     * @param messageContext - The context of the message to check for guess eligibility
     * @param createdAt - The time the guess was made
     * @returns whether the user's guess is eligible
     */
    private guessEligible(
        messageContext: MessageContext,
        createdAt: number,
    ): boolean {
        const userVoiceChannel = getUserVoiceChannel(messageContext);
        // if user isn't in the same voice channel
        if (!userVoiceChannel || userVoiceChannel.id !== this.voiceChannelID) {
            return false;
        }

        // if message isn't in the active game session's text channel
        if (messageContext.textChannelID !== this.textChannelID) {
            return false;
        }

        // Ignore guesses made before the round started
        const round = this.round;
        if (
            round &&
            (round.songStartedAt === null || createdAt < round.songStartedAt)
        ) {
            return false;
        }

        // check elimination mode constraints
        if (this.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = this
                .scoreboard as EliminationScoreboard;

            if (
                !this.scoreboard
                    .getPlayerIDs()
                    .includes(messageContext.author.id) ||
                eliminationScoreboard.isPlayerEliminated(
                    messageContext.author.id,
                )
            ) {
                return false;
            }
        } else if (this.gameType === GameType.TEAMS) {
            const teamScoreboard = this.scoreboard as TeamScoreboard;
            if (!teamScoreboard.getPlayer(messageContext.author.id)) {
                return false;
            }
        }

        return true;
    }

    private async persistGameSession(
        averageGuessTime: number,
        sessionLength: number,
    ): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        await dbContext.kmq
            .insertInto("game_sessions")
            .values({
                start_date: new Date(this.startedAt),
                guild_id: this.guildID,
                num_participants: this.scoreboard
                    .getPlayers()
                    .map((x) => x.inVC).length,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed,
                correct_guesses: this.correctGuesses,
            })
            .execute();
    }

    /**
     * Creates/updates a user's activity in the data store
     * @param userID - The player's Discord user ID
     */
    private async ensurePlayerStat(userID: string): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        const currentDateString = new Date();
        await dbContext.kmq
            .insertInto("player_stats")
            .values({
                player_id: userID,
                first_play: currentDateString,
                last_active: currentDateString,
                last_game_started_at: new Date(this.startedAt),
            })
            .ignore()
            .execute();

        await dbContext.kmq
            .insertInto("player_servers")
            .values({
                player_id: userID,
                server_id: this.guildID,
            })
            .ignore()
            .execute();
    }

    /**
     * Updates a user's songs guessed in the data store
     * @param userID - The player's Discord user ID
     * @param score - The player's score in the current GameSession
     */
    private async incrementPlayerSongsGuessed(
        userID: string,
        score: number,
    ): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        await dbContext.kmq
            .updateTable("player_stats")
            .where("player_id", "=", userID)
            .set({
                songs_guessed: sql`songs_guessed + ${score}`,
                last_active: new Date(),
                last_game_started_at: new Date(this.startedAt),
            })
            .execute();
    }

    /**
     * Updates a user's games played in the data store
     * @param userID - The player's Discord user ID
     */
    private async incrementPlayerGamesPlayed(userID: string): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        await dbContext.kmq
            .updateTable("player_stats")
            .where("player_id", "=", userID)
            .set({
                games_played: sql`games_played + 1`,
            })
            .execute();
    }

    /**
     * @param userID - The Discord ID of the user to exp gain
     * @param expGain - The amount of EXP gained
     */
    private async incrementPlayerExp(
        userID: string,
        expGain: number,
    ): Promise<LevelUpResult | null> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return null;
        }

        const playerStats = await dbContext.kmq
            .selectFrom("player_stats")
            .select(["exp", "level"])
            .where("player_id", "=", userID)
            .executeTakeFirst();

        if (!playerStats) {
            logger.error(`Player stats unexpectedly null for ${userID}`);
            return null;
        }

        const { exp: currentExp, level } = playerStats;

        const newExp = currentExp + expGain;
        let newLevel = level;

        // check for level up
        while (newExp > CUM_EXP_TABLE[newLevel + 1]!) {
            newLevel++;
        }

        // persist exp and level to data store
        await dbContext.kmq
            .updateTable("player_stats")
            .set({ exp: newExp, level: newLevel })
            .where("player_id", "=", userID)
            .execute();

        if (level !== newLevel) {
            logger.info(`${userID} has leveled from ${level} to ${newLevel}`);
            return {
                userID,
                startLevel: level,
                endLevel: newLevel,
            };
        }

        return null;
    }

    /**
     * Store per-session stats for temporary leaderboard
     * @param userID - The user the data belongs to
     * @param correctGuessCount - The number of correct guesses
     * @param expGain - The EXP gained in the game
     * @param levelsGained - The levels gained in the game
     */
    private async insertPerSessionStats(
        userID: string,
        correctGuessCount: number,
        expGain: number,
        levelsGained: number,
    ): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        await dbContext.kmq
            .insertInto("player_game_session_stats")
            .values({
                player_id: userID,
                date: new Date(),
                songs_guessed: correctGuessCount,
                exp_gained: expGain,
                levels_gained: levelsGained,
            })
            .execute();
    }

    /**
     * Creates song entry (if it doesn't exist) and increments song stats
     * @param vlink - The song's YouTube ID
     * @param correct - Whether the guess was correct
     * @param skipped - Whether the song was skipped
     * @param hintRequested - Whether the players received a hint
     * @param timePlayed - How long the song played for
     */
    private incrementSongStats(
        vlink: string,
        correct: boolean,
        skipped: boolean,
        hintRequested: boolean,
        timePlayed: number,
    ): void {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        if (!(vlink in this.songStats)) {
            this.songStats[vlink] = {
                correctGuesses: 0,
                roundsPlayed: 0,
                skipCount: 0,
                hintCount: 0,
                timeToGuess: 0,
                timePlayed: 0,
            };
        }

        const songStats = this.songStats[vlink]!;
        songStats.timePlayed += timePlayed;

        if (correct) {
            songStats.correctGuesses++;
            songStats.timeToGuess += timePlayed;
        }

        if (skipped) {
            songStats.skipCount++;
        }

        if (hintRequested) {
            songStats.hintCount++;
        }
    }

    /**
     * Stores song metadata in the database
     */
    private async storeSongStats(): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        await Promise.allSettled(
            Object.keys(this.songStats).map(async (vlink) => {
                const songStats = this.songStats[vlink];
                await dbContext.kmq
                    .insertInto("song_metadata")
                    .values({
                        vlink,
                        correct_guesses: 0,
                        correct_guesses_legacy: 0,
                        rounds_played_legacy: 0,
                        rounds_played: 0,
                        skip_count: 0,
                        hint_count: 0,
                        time_to_guess_ms: 0,
                        time_played_ms: 0,
                    })
                    .ignore()
                    .execute();

                if (!songStats) {
                    logger.warn(
                        `Song stats for ${vlink} missing in storeSongStats`,
                    );
                    return;
                }

                await dbContext.kmq
                    .updateTable("song_metadata")
                    .where("vlink", "=", vlink)
                    .set({
                        correct_guesses: sql`correct_guesses + ${songStats.correctGuesses}`,
                        rounds_played: sql`rounds_played + ${songStats.roundsPlayed}`,
                        skip_count: sql`skip_count + ${songStats.skipCount}`,
                        hint_count: sql`hint_count + ${songStats.hintCount}`,
                        time_to_guess_ms: sql`time_to_guess_ms + ${songStats.timeToGuess}`,
                        time_played_ms: sql`time_played_ms + ${songStats.timePlayed}`,
                    })
                    .execute();
            }),
        );
    }

    private async updatePlayerStats(
        endedDueToError: boolean,
    ): Promise<Array<LevelUpResult>> {
        const leveledUpPlayers: Array<LevelUpResult> = [];

        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return [];
        }

        // commit player stats
        await Promise.allSettled(
            this.scoreboard.getPlayerIDs().map(async (participant) => {
                const isFirstGame = await isFirstGameOfDay(participant);
                await this.ensurePlayerStat(participant);
                await this.incrementPlayerGamesPlayed(participant);
                const playerCorrectGuessCount =
                    this.scoreboard.getPlayerCorrectGuessCount(participant);

                if (playerCorrectGuessCount > 0) {
                    await this.incrementPlayerSongsGuessed(
                        participant,
                        playerCorrectGuessCount,
                    );
                }

                const playerExpGain =
                    this.scoreboard.getPlayerExpGain(participant);

                let levelUpResult: LevelUpResult | null = null;
                if (playerExpGain > 0) {
                    levelUpResult = await this.incrementPlayerExp(
                        participant,
                        playerExpGain,
                    );
                    if (levelUpResult) {
                        leveledUpPlayers.push(levelUpResult);
                    }
                }

                await this.insertPerSessionStats(
                    participant,
                    playerCorrectGuessCount,
                    playerExpGain,
                    levelUpResult
                        ? levelUpResult.endLevel - levelUpResult.startLevel
                        : 0,
                );

                // if game ended erroneously during player's FGOTD, mark it as errored to allow
                // for bonus to continue next game
                await dbContext.kmq
                    .updateTable("player_stats")
                    .where("player_id", "=", participant)
                    .set({
                        last_game_played_errored:
                            isFirstGame && endedDueToError ? 1 : 0,
                    })
                    .execute();
            }),
        );

        return leveledUpPlayers;
    }

    private async incrementGuildSongGuessCount(): Promise<void> {
        if (this.textChannelID === process.env.END_TO_END_TEST_BOT_CHANNEL) {
            return;
        }

        // increment guild's song guess count
        await dbContext.kmq
            .updateTable("guilds")
            .where("guild_id", "=", this.guildID)
            .set({
                songs_guessed: sql`songs_guessed + 1`,
            })
            .execute();
    }

    /**
     * https://www.desmos.com/calculator/2mah4lpyok
     * @returns the base EXP reward for the gameround
     */
    private calculateBaseExp(): number {
        const songCount = this.getSongCount();
        const eligibleSongCount =
            songCount.count - (songCount.ineligibleDueToCommonAlias || 0);

        const expBase =
            eligibleSongCount <= 10000
                ? 2000 / (1 + Math.exp(1 - 0.0005 * (eligibleSongCount - 1500)))
                : 0.0359335908253 * eligibleSongCount + 1566.01031706;

        let expJitter = expBase * (0.05 * Math.random());
        expJitter *= Math.round(Math.random()) ? 1 : -1;

        return expBase + expJitter;
    }

    private multiguessDelayIsActive(guildPreference: GuildPreference): boolean {
        const playerIsAlone = getNumParticipants(this.voiceChannelID) === 1;
        return (
            guildPreference.gameOptions.multiGuessType === MultiGuessType.ON &&
            !playerIsAlone &&
            !this.guildPreference.isHiddenMode()
        );
    }

    private async updateScoreboard(
        round: GameRound,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
    ): Promise<void> {
        // update scoreboard
        const lastGuesserStreak = this.lastGuesser?.streak ?? 0;
        const isHidden = this.isHiddenMode();

        const correctGuessers = round.getCorrectGuessers(isHidden);

        const playerRoundResults = await Promise.all(
            correctGuessers.map(async (correctGuesser, idx) => {
                const guessPosition = idx + 1;
                const expGain = await ExpCommand.calculateTotalRoundExp(
                    guildPreference,
                    round,
                    getNumParticipants(this.voiceChannelID),
                    idx === 0 ? lastGuesserStreak : 0,
                    round.getTimeToGuessMs(correctGuesser.id, isHidden),
                    guessPosition,
                    await userBonusIsActive(correctGuesser.id),
                    correctGuesser.id,
                );

                let streak = 0;
                if (idx === 0) {
                    streak = lastGuesserStreak;
                    logger.info(
                        `${getDebugLogHeader(messageContext)}, uid: ${correctGuesser.id} | Song correctly guessed. song = ${
                            round.song.songName
                        }. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`,
                    );
                } else {
                    streak = 0;
                    logger.info(
                        `${getDebugLogHeader(messageContext)}, uid: ${correctGuesser.id} | Song correctly guessed ${getOrdinalNum(
                            guessPosition,
                        )}. song = ${
                            round.song.songName
                        }. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`,
                    );
                }

                return {
                    player: correctGuesser,
                    pointsEarned:
                        idx === 0
                            ? correctGuesser.pointsAwarded
                            : correctGuesser.pointsAwarded / 2,
                    expGain,
                    streak,
                };
            }),
        );

        round.playerRoundResults = playerRoundResults;
        const scoreboardUpdatePayload: SuccessfulGuessResult[] =
            playerRoundResults.map((x) => ({
                userID: x.player.id,
                expGain: x.expGain,
                pointsEarned: x.pointsEarned,
            }));

        this.scoreboard.update(scoreboardUpdatePayload);
    }

    private startHiddenUpdateTimer(): void {
        this.hiddenUpdateTimer = setInterval(async () => {
            await this.updateGuessedMembersMessage();
        }, HIDDEN_UPDATE_INTERVAL);
    }

    private async stopHiddenUpdateTimer(): Promise<void> {
        if (this.hiddenUpdateTimer) {
            clearInterval(this.hiddenUpdateTimer);
            const round = this.round;
            try {
                await round?.interactionMessage?.delete();
            } catch (e) {
                logger.warn(
                    `Failed to delete round interaction message. e = ${e}`,
                );
            }

            if (round) {
                round.interactionMessage = null;
            }
        }
    }

    private generateRemainingPlayersMessage(round: GameRound): {
        title: string;
        description: string;
        thumbnailUrl: string;
    } {
        const hiddenTimerInfo = i18n.translate(
            this.guildID,
            "misc.inGame.hiddenTimerInfo",
            {
                guessButton: clickableSlashCommand("guess"),
                timestamp: `<t:${Math.floor(
                    (round.timerStartedAt +
                        this.guildPreference.gameOptions.guessTimeout! * 1000) /
                        1000,
                )}:R>`,
            },
        );

        const waitingFor = `${bold(
            i18n.translate(this.guildID, "misc.inGame.hiddenRemainingPlayers"),
        )}:`;

        const remainingPlayers = this.scoreboard
            .getRemainingPlayers(
                round.getCorrectGuessers(this.isHiddenMode()).map((x) => x.id),
                round.getIncorrectGuessers(),
            )
            .map((player) => player.username)
            .join("\n");

        return {
            title: i18n.translate(
                this.guildID,
                "misc.interaction.guess.title",
                {
                    songOrArtist:
                        this.guildPreference.gameOptions.guessModeType ===
                        GuessModeType.ARTIST
                            ? i18n.translate(this.guildID, "misc.artist")
                            : i18n.translate(this.guildID, "misc.song"),
                },
            ),
            description: `${hiddenTimerInfo}\n\n${waitingFor}\n${remainingPlayers}`,
            thumbnailUrl: KmqImages.THUMBS_UP,
        };
    }

    private async sendMultipleChoiceOptionsMessage(): Promise<void> {
        const locale = State.getGuildLocale(this.guildID);
        const round = this.round;
        if (!round) {
            return;
        }

        const randomSong = round.song;
        const correctChoice =
            this.guildPreference.gameOptions.guessModeType ===
            GuessModeType.ARTIST
                ? round.song.getLocalizedArtistName(locale)
                : round.song.getLocalizedSongName(locale);

        const wrongChoices = await getMultipleChoiceOptions(
            this.guildPreference.gameOptions.answerType,
            this.guildPreference.gameOptions.guessModeType,
            randomSong.members,
            correctChoice,
            randomSong.artistID,
            locale,
        );

        let buttons: Array<Eris.InteractionButton> = [];
        for (const choice of wrongChoices) {
            const id = uuid.v4();
            round.interactionIncorrectAnswerUUIDs[id] = 0;
            buttons.push({
                type: 2,
                style: 1,
                label: choice.substring(0, 70),
                custom_id: id,
            });
        }

        round.interactionCorrectAnswerUUID = uuid.v4() as string;
        buttons.push({
            type: 2,
            style: 1,
            label: correctChoice.substring(0, 70),
            custom_id: round.interactionCorrectAnswerUUID,
        });

        buttons = _.shuffle(buttons);

        let actionRows: Array<ButtonActionRow>;
        switch (this.guildPreference.gameOptions.answerType) {
            case AnswerType.MULTIPLE_CHOICE_EASY:
                actionRows = [
                    {
                        type: 1,
                        components: buttons,
                    },
                ];
                break;
            case AnswerType.MULTIPLE_CHOICE_MED:
                actionRows = chunkArray(buttons, 3).map((x) => ({
                    type: 1,
                    components: x,
                }));
                break;
            case AnswerType.MULTIPLE_CHOICE_HARD:
                actionRows = chunkArray(buttons, 4).map((x) => ({
                    type: 1,
                    components: x,
                }));
                break;
            default:
                logger.error(
                    `Unexpected answerType: ${this.guildPreference.gameOptions.answerType}`,
                );

                actionRows = [
                    {
                        type: 1,
                        components: buttons,
                    },
                ];
                break;
        }

        if (this.isClipMode()) {
            actionRows.unshift({
                type: 1,
                components: this.generateClipButtons(),
            });
        }

        round.interactionComponents = actionRows;

        round.interactionMessage = await sendInfoMessage(
            new MessageContext(this.textChannelID, null, this.guildID),
            {
                title: i18n.translate(
                    this.guildID,
                    "misc.interaction.guess.title",
                    {
                        songOrArtist:
                            this.guildPreference.gameOptions.guessModeType ===
                            GuessModeType.ARTIST
                                ? i18n.translate(this.guildID, "misc.artist")
                                : i18n.translate(this.guildID, "misc.song"),
                    },
                ),
                components: actionRows,
                thumbnailUrl: KmqImages.LISTENING,
            },
        );
    }

    private async sendHiddenGuessMessage(
        messageContext: MessageContext,
        round: GameRound,
    ): Promise<void> {
        round.interactionMessage = await sendInfoMessage(messageContext, {
            ...this.generateRemainingPlayersMessage(round),
            components: this.isClipMode()
                ? [{ type: 1, components: this.generateClipButtons() }]
                : undefined,
        });

        this.startHiddenUpdateTimer();
    }

    private async sendClipMessage(
        messageContext: MessageContext,
        round: GameRound,
    ): Promise<void> {
        round.interactionMessage = await sendInfoMessage(messageContext, {
            title: i18n.translate(
                this.guildID,
                "misc.interaction.guess.title",
                {
                    songOrArtist:
                        this.guildPreference.gameOptions.guessModeType ===
                        GuessModeType.ARTIST
                            ? i18n.translate(this.guildID, "misc.artist")
                            : i18n.translate(this.guildID, "misc.song"),
                },
            ),
            description: i18n.translate(this.guildID, "misc.inGame.clipMode"),
            thumbnailUrl: KmqImages.LISTENING,
            components: [
                {
                    type: 1,
                    components: this.generateClipButtons(),
                },
            ],
        });
    }

    private generateClipButtons(): Eris.InteractionButton[] {
        return [
            {
                type: 2,
                style: 1,
                custom_id: ClipAction.REPLAY,
                label: i18n.translate(this.guildID, "misc.interaction.replay"),
                emoji: { name: "🔁", id: null },
            },
            {
                type: 2,
                style: 1,
                custom_id: ClipAction.NEW_CLIP,
                label: i18n.translate(this.guildID, "misc.interaction.newClip"),
                emoji: { name: "🎬", id: null },
            },
        ];
    }
}
