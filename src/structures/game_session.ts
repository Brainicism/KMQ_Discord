/* eslint-disable no-return-assign */
import * as uuid from "uuid";
import _ from "lodash";
import type Eris from "eris";

import {
    bold,
    chunkArray,
    clickableSlashCommand,
    codeLine,
    delay,
    getOrdinalNum,
    setDifference,
} from "../helpers/utils";
import {
    fetchUser,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getNumParticipants,
    getUserVoiceChannel,
    sendInfoMessage,
    sendPaginationedEmbed,
    tryCreateInteractionErrorAcknowledgement,
    tryInteractionAcknowledge,
} from "../helpers/discord_utils";
import {
    getLocalizedArtistName,
    getLocalizedSongName,
    getMultipleChoiceOptions,
    getTimeToGuessMs,
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
    SONG_START_DELAY,
    VOTE_LINK,
} from "../constants";
import { IPCLogger } from "../logger";
import { calculateTotalRoundExp } from "../commands/game_commands/exp";
import { getRankNameByLevel } from "../commands/game_commands/profile";
import { sql } from "kysely";
import AnswerType from "../enums/option_types/answer_type";
import EliminationPlayer from "./elimination_player";
import EliminationScoreboard from "./elimination_scoreboard";
import GameRound from "./game_round";
import GameType from "../enums/game_type";
import GuessModeType from "../enums/option_types/guess_mode_type";
import GuildPreference from "./guild_preference";
import KmqMember from "./kmq_member";
import MessageContext from "./message_context";
import MultiGuessType from "../enums/option_types/multiguess_type";
import Player from "./player";
import Scoreboard from "./scoreboard";
import Session from "./session";
import TeamScoreboard from "./team_scoreboard";
import i18n from "../helpers/localization_manager";
import type { ButtonActionRow, GuildTextableMessage } from "../types";
import type { CommandInteraction } from "eris";
import type GuessResult from "../interfaces/guess_result";
import type QueriedSong from "../interfaces/queried_song";
import type Round from "./round";
import type SuccessfulGuessResult from "../interfaces/success_guess_result";

const MULTIGUESS_DELAY = 1500;
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
        if (this.sessionInitialized) {
            // Only add a delay if the game has already started
            await delay(
                this.multiguessDelayIsActive(this.guildPreference)
                    ? SONG_START_DELAY - MULTIGUESS_DELAY
                    : SONG_START_DELAY,
            );
        }

        if (this.finished || this.round) {
            return null;
        }

        const round = (await super.startRound(messageContext)) as GameRound;

        if (!round) {
            return null;
        }

        if (this.gameType === GameType.HIDDEN) {
            // Show players that haven't guessed and a button to guess
            round.interactionMessage = await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                this.generateRemainingPlayersMessage(round),
            );

            this.startHiddenUpdateTimer();
        }

        if (this.guildPreference.isMultipleChoiceMode()) {
            const locale = State.getGuildLocale(this.guildID);
            const randomSong = round.song;
            const correctChoice =
                this.guildPreference.gameOptions.guessModeType ===
                GuessModeType.ARTIST
                    ? getLocalizedArtistName(round.song, locale)
                    : getLocalizedSongName(round.song, locale, false);

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

            round.interactionComponents = actionRows;

            round.interactionMessage = await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    title: i18n.translate(
                        this.guildID,
                        "misc.interaction.guess.title",
                        {
                            songOrArtist:
                                this.guildPreference.gameOptions
                                    .guessModeType === GuessModeType.ARTIST
                                    ? i18n.translate(
                                          this.guildID,
                                          "misc.artist",
                                      )
                                    : i18n.translate(this.guildID, "misc.song"),
                        },
                    ),
                    components: actionRows,
                    thumbnailUrl: KmqImages.LISTENING,
                },
            );
        }

        return round;
    }

    /**
     * Ends an active GameRound
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param guessResult - Whether the round ended via a correct guess (includes exp gain), or other (timeout, error, etc)
     */
    async endRound(
        messageContext: MessageContext,
        guessResult: GuessResult,
    ): Promise<void> {
        if (this.round === null) {
            return;
        }

        const round = this.round;

        if (round.songStartedAt === null) {
            return;
        }

        if (guessResult.correct) {
            guessResult.correctGuessers = (
                guessResult.correctGuessers ?? []
            ).sort(
                (a, b) =>
                    getTimeToGuessMs(a, round, this.gameType) -
                    getTimeToGuessMs(b, round, this.gameType),
            );
        }

        if (this.gameType === GameType.HIDDEN) {
            this.stopHiddenUpdateTimer();

            if (!guessResult.correct && round.correctGuessers.length > 0) {
                // At least one person guessed correctly but someone didn't submit a /guess,
                // which led to the timer ending and guessResult.correct being false
                guessResult = {
                    correct: true,
                    correctGuessers: round.correctGuessers.sort(
                        (a, b) =>
                            getTimeToGuessMs(a, round, this.gameType) -
                            getTimeToGuessMs(b, round, this.gameType),
                    ),
                };
            }
        }

        await super.endRound(messageContext);

        round.interactionMarkAnswers(guessResult.correctGuessers?.length ?? 0);

        const timePlayed = Date.now() - round.songStartedAt;
        if (guessResult.correct) {
            // update guessing streaks
            if (
                guessResult.correctGuessers &&
                (this.lastGuesser === null ||
                    this.lastGuesser.userID !==
                        guessResult.correctGuessers[0].id)
            ) {
                this.lastGuesser = {
                    userID: guessResult.correctGuessers[0].id,
                    streak: 1,
                };
            } else if (this.lastGuesser) {
                this.lastGuesser.streak++;
            }

            this.guessTimes.push(timePlayed);
            await this.updateScoreboard(
                round,
                guessResult,
                this.guildPreference,
                messageContext,
            );
        } else if (!guessResult.error) {
            this.lastGuesser = null;
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this
                    .scoreboard as EliminationScoreboard;

                eliminationScoreboard.decrementAllLives();
            }
        }

        this.incrementSongStats(
            round.song.youtubeLink,
            guessResult.correct,
            round.skipAchieved,
            round.hintUsed,
            timePlayed,
        );

        const remainingDuration = this.getRemainingDuration(
            this.guildPreference,
        );

        if (messageContext) {
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

            const useLargerScoreboard =
                this.scoreboard.shouldUseLargerScoreboard();

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
                this.songSelector.getUniqueSongCounter(this.guildPreference),
                playerRoundResults,
                this.gameType,
            )}${scoreboardTitle}`;

            const correctGuess = playerRoundResults.length > 0;
            const embedColor = round.getEndRoundColor(
                correctGuess,
                await userBonusIsActive(
                    playerRoundResults[0]?.player.id ??
                        messageContext.author.id,
                ),
            );

            const endRoundMessage = await this.sendRoundMessage(
                messageContext,
                fields,
                round,
                description,
                embedColor,
                correctGuess && !this.guildPreference.isMultipleChoiceMode(),
                remainingDuration,
            );

            round.roundMessageID = endRoundMessage?.id as string;
        }

        this.updateBookmarkSongList(round);

        if (this.scoreboard.gameFinished(this.guildPreference)) {
            this.endSession("Game finished due to game options", false);
        } else if (
            this.gameType === GameType.SUDDEN_DEATH &&
            !guessResult.correct
        ) {
            this.endSession("Sudden death game ended", false);
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

        const leveledUpPlayers: Array<LevelUpResult> = [];

        // commit player stats
        await Promise.allSettled(
            this.scoreboard.getPlayerIDs().map(async (participant) => {
                const isFirstGame = await isFirstGameOfDay(participant);
                await this.ensurePlayerStat(participant);
                await GameSession.incrementPlayerGamesPlayed(participant);
                const playerCorrectGuessCount =
                    this.scoreboard.getPlayerCorrectGuessCount(participant);

                if (playerCorrectGuessCount > 0) {
                    await GameSession.incrementPlayerSongsGuessed(
                        participant,
                        playerCorrectGuessCount,
                    );
                }

                const playerExpGain =
                    this.scoreboard.getPlayerExpGain(participant);

                let levelUpResult: LevelUpResult | null = null;
                if (playerExpGain > 0) {
                    levelUpResult = await GameSession.incrementPlayerExp(
                        participant,
                        playerExpGain,
                    );
                    if (levelUpResult) {
                        leveledUpPlayers.push(levelUpResult);
                    }
                }

                await GameSession.insertPerSessionStats(
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
                            getRankNameByLevel(
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

            sendInfoMessage(
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

        // commit session's song plays and correct guesses
        if (!this.guildPreference.isMultipleChoiceMode()) {
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
            this.guildPreference.isMultipleChoiceMode(),
            this.guildPreference.typosAllowed(),
        );

        if (this.gameType === GameType.HIDDEN) {
            // Determine whether to wait for more guesses
            if (
                this.scoreboard.getRemainingPlayers(
                    round.correctGuessers,
                    round.incorrectGuessers,
                ).length > 0
            ) {
                // If there are still players who haven't guessed correctly, don't end the round
                return;
            } else {
                // Everyone guessed, end the round
                this.stopHiddenUpdateTimer();
            }
        }

        if (
            pointsEarned > 0 ||
            (this.gameType === GameType.HIDDEN &&
                round.correctGuessers.length > 0)
        ) {
            // If not hidden, someone guessed correctly
            // If hidden, everyone guessed and at least one person was right
            if (round.finished) {
                return;
            }

            round.finished = true;
            await delay(
                this.multiguessDelayIsActive(this.guildPreference)
                    ? MULTIGUESS_DELAY
                    : 0,
            );

            // mark round as complete, so no more guesses can go through
            await this.endRound(messageContext, {
                correct: true,
                correctGuessers: round.correctGuessers,
            });
            this.correctGuesses++;

            // update game session's lastActive
            this.lastActiveNow();

            this.stopGuessTimeout();

            // increment guild's song guess count
            await dbContext.kmq
                .updateTable("guilds")
                .where("guild_id", "=", this.guildID)
                .set({
                    songs_guessed: sql`songs_guessed + 1`,
                })
                .execute();

            await this.startRound(messageContext);
        } else if (
            this.guildPreference.isMultipleChoiceMode() ||
            this.gameType === GameType.HIDDEN
        ) {
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
                    [...round.incorrectGuessers],
                ).size === 0
            ) {
                await this.endRound(
                    new MessageContext(this.textChannelID, null, this.guildID),
                    { correct: false },
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
    updateOwner(): void {
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

        this.owner = new KmqMember(newOwnerID);

        super.updateOwner();
    }

    async handleComponentInteraction(
        interaction: Eris.ComponentInteraction<Eris.TextableChannel>,
        messageContext: MessageContext,
    ): Promise<void> {
        if (!this.round) return;
        if (
            !this.handleInSessionInteractionFailures(
                interaction,
                messageContext,
            )
        ) {
            return;
        }

        const round = this.round;

        if (
            round.incorrectGuessers.has(interaction.member!.id) ||
            !this.guessEligible(messageContext, interaction.createdAt)
        ) {
            tryCreateInteractionErrorAcknowledgement(
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
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                null,
                i18n.translate(
                    this.guildID,
                    "misc.failure.interaction.eliminated",
                ),
            );

            round.incorrectGuessers.add(interaction.member!.id);
            round.interactionIncorrectAnswerUUIDs[interaction.data.custom_id]++;

            // Add the user as a participant
            this.guessSong(messageContext, "", interaction.createdAt);
            return;
        }

        tryInteractionAcknowledge(interaction);

        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID,
        );

        this.guessSong(
            messageContext,
            guildPreference.gameOptions.guessModeType !== GuessModeType.ARTIST
                ? round.song.songName
                : round.song.artistName,
            interaction.createdAt,
        );
    }

    /**
     * Update whether a player is in VC
     * @param userID - The Discord user ID of the player to update
     * @param inVC - Whether the player is currently in the voice channel
     */
    async setPlayerInVC(userID: string, inVC: boolean): Promise<void> {
        if (!this.scoreboard) {
            return;
        }

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

            await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    color:
                        this.gameType !== GameType.TEAMS &&
                        (await userBonusIsActive(winners[0].id))
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
                    thumbnailUrl: winners[0].getAvatarURL(),
                    title: `🎉 ${this.scoreboard.getWinnerMessage(
                        this.guildID,
                    )} 🎉`,
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

    updateGuessedMembersMessage(): void {
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
        round.interactionMessage?.edit({
            embeds: [
                {
                    ...this.generateRemainingPlayersMessage(round),
                    thumbnail: { url: KmqImages.THUMBS_UP },
                },
            ],
        });
    }

    /** @returns if multiple choice mode is active */
    isMultipleChoiceMode(): boolean {
        return this.guildPreference.isMultipleChoiceMode();
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    protected prepareRound(randomSong: QueriedSong): Round {
        const gameRound = new GameRound(randomSong, this.calculateBaseExp());
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
        if (multipleChoiceMode && round.incorrectGuessers.has(userID)) return 0;

        if (
            !round.correctGuessers.map((x) => x.id).includes(userID) &&
            !round.incorrectGuessers.has(userID)
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

    /**
     * Creates/updates a user's activity in the data store
     * @param userID - The player's Discord user ID
     */
    private async ensurePlayerStat(userID: string): Promise<void> {
        const currentDateString = new Date();
        await dbContext.kmq
            .insertInto("player_stats")
            .values({
                player_id: userID,
                first_play: currentDateString,
                last_active: currentDateString,
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
    private static async incrementPlayerSongsGuessed(
        userID: string,
        score: number,
    ): Promise<void> {
        await dbContext.kmq
            .updateTable("player_stats")
            .where("player_id", "=", userID)
            .set({
                songs_guessed: sql`songs_guessed + ${score}`,
                last_active: new Date(),
            })
            .execute();
    }

    /**
     * Updates a user's games played in the data store
     * @param userID - The player's Discord user ID
     */
    private static async incrementPlayerGamesPlayed(
        userID: string,
    ): Promise<void> {
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
    private static async incrementPlayerExp(
        userID: string,
        expGain: number,
    ): Promise<LevelUpResult | null> {
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
        while (newExp > CUM_EXP_TABLE[newLevel + 1]) {
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
    private static async insertPerSessionStats(
        userID: string,
        correctGuessCount: number,
        expGain: number,
        levelsGained: number,
    ): Promise<void> {
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

        this.songStats[vlink].timePlayed += timePlayed;

        if (correct) {
            this.songStats[vlink].correctGuesses++;
            this.songStats[vlink].timeToGuess += timePlayed;
        }

        if (skipped) {
            this.songStats[vlink].skipCount++;
        }

        if (hintRequested) {
            this.songStats[vlink].hintCount++;
        }
    }

    /**
     * Stores song metadata in the database
     */
    private async storeSongStats(): Promise<void> {
        await Promise.allSettled(
            Object.keys(this.songStats).map(async (vlink) => {
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

                await dbContext.kmq
                    .updateTable("song_metadata")
                    .where("vlink", "=", vlink)
                    .set({
                        correct_guesses: sql`correct_guesses + ${this.songStats[vlink].correctGuesses}`,
                        rounds_played: sql`rounds_played + ${this.songStats[vlink].roundsPlayed}`,
                        skip_count: sql`skip_count + ${this.songStats[vlink].skipCount}`,
                        hint_count: sql`hint_count + ${this.songStats[vlink].hintCount}`,
                        time_to_guess_ms: sql`time_to_guess_ms + ${this.songStats[vlink].timeToGuess}`,
                        time_played_ms: sql`time_played_ms + ${this.songStats[vlink].timePlayed}`,
                    })
                    .execute();
            }),
        );
    }

    /**
     * https://www.desmos.com/calculator/9x3dkrmt84
     * @returns the base EXP reward for the gameround
     */
    private calculateBaseExp(): number {
        const songCount = this.getSongCount();
        // minimum amount of songs for exp gain
        const expBase =
            2000 / (1 + Math.exp(1 - 0.0005 * (songCount.count - 1500)));

        let expJitter = expBase * (0.05 * Math.random());
        expJitter *= Math.round(Math.random()) ? 1 : -1;

        return expBase + expJitter;
    }

    private multiguessDelayIsActive(guildPreference: GuildPreference): boolean {
        const playerIsAlone = getNumParticipants(this.voiceChannelID) === 1;
        const isHiddenGameType = this.gameType === GameType.HIDDEN;
        return (
            guildPreference.gameOptions.multiGuessType === MultiGuessType.ON &&
            !playerIsAlone &&
            !isHiddenGameType
        );
    }

    private async updateScoreboard(
        round: GameRound,
        guessResult: GuessResult,
        guildPreference: GuildPreference,
        messageContext: MessageContext,
    ): Promise<void> {
        // update scoreboard
        const lastGuesserStreak = this.lastGuesser?.streak ?? 0;

        const playerRoundResults = await Promise.all(
            (guessResult.correctGuessers ?? []).map(
                async (correctGuesser, idx) => {
                    const guessPosition = idx + 1;
                    const expGain = await calculateTotalRoundExp(
                        guildPreference,
                        round,
                        getNumParticipants(this.voiceChannelID),
                        lastGuesserStreak,
                        getTimeToGuessMs(correctGuesser, round, this.gameType),
                        guessPosition,
                        await userBonusIsActive(correctGuesser.id),
                        correctGuesser.id,
                    );

                    let streak = 0;
                    if (idx === 0) {
                        streak = lastGuesserStreak;
                        logger.info(
                            `${getDebugLogHeader(messageContext)}, uid: ${
                                correctGuesser.id
                            } | Song correctly guessed. song = ${
                                round.song.songName
                            }. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`,
                        );
                    } else {
                        streak = 0;
                        logger.info(
                            `${getDebugLogHeader(messageContext)}, uid: ${
                                correctGuesser.id
                            } | Song correctly guessed ${getOrdinalNum(
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
                },
            ),
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
        this.hiddenUpdateTimer = setInterval(() => {
            this.updateGuessedMembersMessage();
        }, HIDDEN_UPDATE_INTERVAL);
    }

    private stopHiddenUpdateTimer(): void {
        if (this.hiddenUpdateTimer) {
            clearInterval(this.hiddenUpdateTimer);
            const round = this.round;
            round?.interactionMessage?.delete();
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
            .getRemainingPlayers(round.correctGuessers, round.incorrectGuessers)
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
}
