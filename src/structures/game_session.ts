/* eslint-disable no-return-assign */
import * as uuid from "uuid";
import Eris from "eris";
import _ from "lodash";

import { E_TIMEOUT } from "async-mutex";
import {
    bold,
    chunkArray,
    codeLine,
    delay,
    friendlyFormattedNumber,
    getMention,
    getOrdinalNum,
    setDifference,
} from "../helpers/utils";
import {
    clickableSlashCommand,
    fetchUser,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getMajorityCount,
    getNumParticipants,
    getUserVoiceChannel,
    sendInfoMessage,
    sendPaginationedEmbed,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
    tryInteractionAcknowledge,
} from "../helpers/discord_utils";
import { dailyChallengeDateValue } from "../helpers/daily_challenge";
import {
    getMultipleChoiceOptions,
    isFirstGameOfDay,
    userBonusIsActive,
} from "../helpers/game_utils";
import State from "../state";
import dbContext from "../database_context";

import {
    CLIP_LAST_REPLAY_DELAY_MS,
    CLIP_MAX_REPLAY_COUNT,
    CLIP_PADDING_BEGINNING_MS,
    CLIP_VC_END_TIMEOUT_MS,
    CUM_EXP_TABLE,
    DAILY_CHALLENGE_ROUNDS,
    ELIMINATION_DEFAULT_LIVES,
    EMBED_FIELDS_PER_PAGE,
    EMBED_SUCCESS_BONUS_COLOR,
    EMBED_SUCCESS_COLOR,
    KmqImages,
    REVIEW_LINK,
    SKIP_BUTTON_PREFIX,
    VOTE_LINK,
} from "../constants";
import { IPCLogger } from "../logger";
import { SessionState } from "./session_state";
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
import KmqConfiguration from "../kmq_configuration";
import KmqMember from "./kmq_member";
import MessageContext from "./message_context";
import MultiGuessType from "../enums/option_types/multiguess_type";
import MultipleChoiceGuessResult from "../enums/multiple_choice_guess_result";
import Player from "./player";
import ProfileCommand from "../commands/game_commands/profile";
import Scoreboard from "./scoreboard";
import Session from "./session";
import SkipCommand from "../commands/game_commands/skip";
import TeamScoreboard from "./team_scoreboard";
import i18n from "../helpers/localization_manager";
import type { ButtonActionRow, GuildTextableMessage } from "../types";
import type { CommandInteraction } from "eris";
import type GameSessionRecap from "../interfaces/game_session_recap";
import type GuildPreference from "./guild_preference";
import type PlayerRoundResult from "../interfaces/player_round_result";
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

    /** How long a clip should be played for in the clip game mode, in seconds */
    public readonly clipDurationLength: number | null;

    /** Whether to play a new clip instead of repeating the same one in clip mode */
    public readonly clipPlayNewClip: boolean | null;

    /** The current GameRound */
    public round: GameRound | null;

    /** True for a Daily Challenge session: a fixed deterministic song set,
     *  locked options, ends after DAILY_CHALLENGE_ROUNDS, and writes a per-player
     *  result row on completion. */
    public dailyChallenge = false;

    /** The ISO `YYYY-MM-DD` this daily session counts toward (only when
     *  dailyChallenge is true). */
    public dailyChallengeDate: string | null = null;

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

    /** Fastest correct guess this session (for the end-game recap). */
    private fastestGuess: { userID: string; timeMs: number } | null;

    /** Longest guess streak reached this session (for the end-game recap). */
    private longestStreak: { userID: string; streak: number } | null;

    /** Manages updating a message with current guessers with hidden enabled */
    private hiddenUpdateTimer: NodeJS.Timeout | null;

    /** Set immediately when endSession is requested, before the mutex is acquired.
     *  Allows startRoundCore to abort its between-round delay even while the mutex is held. */
    private pendingEndSession = false;

    /** Per-player Daily Challenge tallies, accumulated across rounds and
     *  persisted at session end. Keyed by userID. */
    private dailyPlayerStats: Map<
        string,
        { correct: number; currentStreak: number; bestStreak: number }
    > = new Map();

    constructor(
        guildPreference: GuildPreference,
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember,
        gameType: GameType,
        eliminationLives?: number,
        clipDurationLength?: number,
        clipPlayNewClip?: boolean,
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
        this.fastestGuess = null;
        this.longestStreak = null;
        this.hiddenUpdateTimer = null;
        this.clipDurationLength = clipDurationLength || null;
        this.clipPlayNewClip = clipPlayNewClip || null;

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

        if (this.gameType === GameType.TEAMS) {
            this.stateMachine.transition(SessionState.LOBBY);
        }

        // eslint-disable-next-line @typescript-eslint/require-await
        this.guildPreference.answerTypeChangeCallback = async () => {
            const round = this.round;

            if (!round) return;
            if (this.isMultipleChoiceMode()) {
                logger.info(
                    `gid: ${this.guildID} | answerType changed to multiple choice, re-sending mc buttons`,
                );

                // Reuse this difficulty's cached choices if present (same
                // options, order, and answer UUIDs); the cache is keyed per
                // answer type, so a first visit to a difficulty generates a
                // fresh set while revisits restore the identical one.
                await this.sendMultipleChoiceOptionsMessage(true);
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
     * Starting a new GameRound (mutex-protected entry point).
     * Serialized with endRound/endSession to prevent concurrent lifecycle transitions.
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(messageContext: MessageContext): Promise<Round | null> {
        const waitStart = Date.now();
        try {
            return await this.lifecycleMutex.runExclusive(() => {
                const waitMs = Date.now() - waitStart;
                if (waitMs > 5000) {
                    logger.warn(
                        `gid: ${this.guildID} | startRound() waited ${waitMs}ms for lifecycleMutex`,
                    );
                }

                return this.startRoundCore(messageContext);
            });
        } catch (e) {
            if (e === E_TIMEOUT) {
                logger.error(
                    `gid: ${this.guildID} | DEADLOCK: startRound() could not acquire lifecycleMutex after 30s — force-removing session`,
                );

                Session.deleteSession(this.guildID);
                return null;
            }

            throw e;
        }
    }

    /**
     * Ends an active GameRound (mutex-protected entry point).
     * Serialized with startRound/endSession to prevent concurrent lifecycle transitions.
     * @param isError - Whether the round ended due to an error
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param gameRound - The round to end
     */
    async endRound(
        isError: boolean,
        messageContext: MessageContext,
        gameRound?: GameRound,
    ): Promise<void> {
        const waitStart = Date.now();
        try {
            await this.lifecycleMutex.runExclusive(async () => {
                const waitMs = Date.now() - waitStart;
                if (waitMs > 5000) {
                    logger.warn(
                        `gid: ${this.guildID} | endRound() waited ${waitMs}ms for lifecycleMutex`,
                    );
                }

                await this.endRoundCore(isError, messageContext, gameRound);
            });
        } catch (e) {
            if (e === E_TIMEOUT) {
                logger.error(
                    `gid: ${this.guildID} | DEADLOCK: endRound() could not acquire lifecycleMutex after 30s — force-removing session`,
                );

                Session.deleteSession(this.guildID);
                return;
            }

            throw e;
        }
    }

    /**
     * Ends the current GameSession (mutex-protected entry point).
     * Serialized with startRound/endRound to prevent concurrent lifecycle transitions.
     * @param reason - The reason for the game session end
     * @param endedDueToError - Whether the session ended due to an error
     */
    async endSession(reason: string, endedDueToError: boolean): Promise<void> {
        this.pendingEndSession = true;
        const waitStart = Date.now();
        try {
            await this.lifecycleMutex.runExclusive(async () => {
                const waitMs = Date.now() - waitStart;
                if (waitMs > 5000) {
                    logger.warn(
                        `gid: ${this.guildID} | endSession("${reason}") waited ${waitMs}ms for lifecycleMutex`,
                    );
                }

                await this.endSessionCore(reason, endedDueToError);
            });
        } catch (e) {
            if (e === E_TIMEOUT) {
                logger.error(
                    `gid: ${this.guildID} | DEADLOCK: endSession("${reason}") could not acquire lifecycleMutex after 30s — force-removing session`,
                );

                Session.deleteSession(this.guildID);
                return;
            }

            throw e;
        }
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
        // Allow clip mode guesses in between clip replays
        if (!this.isClipMode()) {
            if (!this.connection) return;
            if (this.connection.listenerCount("end") === 0) return;
        }

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

        this.emit("guessReceived", {
            userID: messageContext.author.id,
            isCorrect: pointsEarned > 0,
            ts: createdAt,
        });

        if (pointsEarned) {
            logger.info(
                `${getDebugLogHeader(messageContext)} | Correct guess submitted: '${guess}'`,
            );
        }

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
                if (pointsEarned) {
                    logger.info(
                        `${getDebugLogHeader(messageContext)} | Correct guess submitted, but in hidden mode and waiting on other guesses`,
                    );
                }

                // If there are still players who haven't guessed correctly, don't end the round
                return;
            } else {
                // Everyone guessed, end the round
                logger.info(
                    `${getDebugLogHeader(messageContext)} | No remaining guessers in hidden mode.`,
                );
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
                logger.info(
                    `${getDebugLogHeader(messageContext)} | Correct guess submitted, but round is already finished.`,
                );
                return;
            }

            this.stopGuessTimeout();
            // mark round as complete, so no more guesses can go through
            await this.endRound(false, messageContext, round);

            // update game session's lastActive
            await this.lastActiveNow();

            await this.incrementGuildSongGuessCount();
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
                logger.info(
                    `${getDebugLogHeader(messageContext)} | Everybody guessed, but nobody was correct`,
                );

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

    /**
     * Builds the end-of-session recap from accumulated session state. userIDs
     * stay raw; consumers resolve names.
     * @returns the recap summary
     */
    buildRecap(): GameSessionRecap {
        const winners = this.scoreboard.getWinners();
        const topWinner = winners[0];
        return {
            mvp:
                topWinner && topWinner.getScore() > 0
                    ? { userID: topWinner.id, score: topWinner.getScore() }
                    : null,
            fastestGuess: this.fastestGuess,
            longestStreak: this.longestStreak,
            totalCorrect: this.correctGuesses,
            totalRounds: this.roundsPlayed,
        };
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
        interaction: Eris.ComponentInteraction,
        messageContext: MessageContext,
    ): Promise<boolean> {
        const interactionHandled = await super.handleComponentInteraction(
            interaction,
            messageContext,
        );

        if (interactionHandled) {
            return true;
        }

        if (
            !(await this.handleInSessionInteractionFailures(
                interaction,
                messageContext,
            ))
        ) {
            return true;
        }

        if (!this.round) return false;
        const round = this.round;
        if (interaction.data.custom_id.startsWith(SKIP_BUTTON_PREFIX)) {
            const guildID = interaction.guild?.id as string;
            round.userSkipped(interaction.member!.id);
            if (SkipCommand.isSkipMajority(guildID, this)) {
                await round.interactionSuccessfulSkip();
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    i18n.translate(guildID, "misc.skip"),
                    i18n.translate(
                        guildID,
                        "command.skip.success.description",
                        {
                            skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                                guildID,
                            )}`,
                        },
                    ),
                );

                await SkipCommand.skipSong(messageContext, this);
                return true;
            } else {
                await tryCreateInteractionSuccessAcknowledgement(
                    interaction,
                    i18n.translate(guildID, "command.skip.vote.title"),
                    i18n.translate(guildID, "command.skip.vote.description", {
                        skipCounter: `${round.getSkipCount()}/${getMajorityCount(
                            guildID,
                        )}`,
                    }),
                );

                logger.info(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Skip vote received.`,
                );

                return true;
            }
        }

        // Acknowledge the pick before the round-end work runs: both a correct
        // pick AND an incorrect one can trigger that work (in solo MC an
        // incorrect pick is "everybody guessed, nobody correct", which ends the
        // round and starts the next one — several seconds of song loading).
        // Acking afterwards would blow past Discord's 3s interaction deadline
        // and fail the interaction, so we ack from the callbacks that fire
        // before the transition: onCorrect for a correct pick, onAccepted's
        // INCORRECT branch (the "you're out this round" notice) for a wrong one.
        const mcResult = await this.submitMultipleChoiceGuess(
            interaction.member!.id,
            interaction.data.custom_id,
            interaction.createdAt,
            messageContext,
            () => tryInteractionAcknowledge(interaction),
            (outcome) => {
                if (outcome === MultipleChoiceGuessResult.INCORRECT) {
                    // Fire-and-forget so the ack is dispatched before the
                    // round-end transition rather than awaited after it.
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    tryCreateInteractionErrorAcknowledgement(
                        interaction,
                        null,
                        i18n.translate(
                            this.guildID,
                            "misc.failure.interaction.eliminated",
                        ),
                    ).catch(() => undefined);
                }
            },
        );

        if (mcResult === MultipleChoiceGuessResult.INELIGIBLE) {
            await tryCreateInteractionErrorAcknowledgement(
                interaction,
                null,
                i18n.translate(
                    this.guildID,
                    "misc.failure.interaction.alreadyEliminated",
                ),
            );
            return true;
        }

        // INCORRECT was acknowledged early in the onAccepted callback above
        // (before the round-end transition); nothing left to do here.
        return true;
    }

    /**
     * Core multiple-choice pick logic shared by the Discord button handler and
     * the Activity. Validates eligibility, records the pick, and routes scoring
     * through guessSong exactly like the text path. It does NOT send Eris
     * interaction acknowledgements — callers handle their own UI feedback.
     * @param userID - the player making the pick
     * @param choiceID - the tapped button custom_id (uuid)
     * @param createdAt - the pick timestamp (epoch ms)
     * @param messageContext - context for the synthesized guess
     * @param onCorrect - invoked once, right before the correct-guess scoring
     * runs, so an interaction-based caller can acknowledge within the deadline
     * @param onAccepted - invoked once with the (incorrect/correct) outcome as
     * soon as the pick is accepted, BEFORE the round-lifecycle transition
     * (guessSong → endRound) runs. Lets a caller acknowledge immediately
     * instead of blocking on the lifecycleMutex, which can be contended for
     * many seconds. Not called for ineligible picks.
     * @returns whether the pick was ineligible, incorrect, or correct
     */
    async submitMultipleChoiceGuess(
        userID: string,
        choiceID: string,
        createdAt: number,
        messageContext: MessageContext,
        onCorrect?: () => Promise<unknown>,
        onAccepted?: (
            outcome:
                | MultipleChoiceGuessResult.INCORRECT
                | MultipleChoiceGuessResult.CORRECT,
        ) => void,
    ): Promise<MultipleChoiceGuessResult> {
        const round = this.round;
        if (!round) return MultipleChoiceGuessResult.INELIGIBLE;

        if (
            round.getIncorrectGuessers().has(userID) ||
            !this.guessEligible(messageContext, createdAt)
        ) {
            return MultipleChoiceGuessResult.INELIGIBLE;
        }

        if (!round.isCorrectInteractionAnswer(choiceID)) {
            if (round.interactionIncorrectAnswerUUIDs[choiceID] !== undefined) {
                round.interactionIncorrectAnswerUUIDs[choiceID]++;
            } else {
                logger.warn(
                    `interactionIncorrectAnswerUUIDs unexpectedly not initialized for ${choiceID}`,
                );
                round.interactionIncorrectAnswerUUIDs[choiceID] = 1;
            }

            // Add the user as an (incorrect) participant, recording the label
            // of the option they actually chose so it can be displayed (e.g.
            // in the Activity) instead of an empty guess. The label is a
            // distinct wrong choice, so it never matches and stays incorrect.
            const chosenLabel =
                round.multipleChoiceOptions.find(
                    (button) => button.custom_id === choiceID,
                )?.label ?? "";

            onAccepted?.(MultipleChoiceGuessResult.INCORRECT);
            await this.guessSong(messageContext, chosenLabel, createdAt);
            return MultipleChoiceGuessResult.INCORRECT;
        }

        if (onCorrect) {
            await onCorrect();
        }

        onAccepted?.(MultipleChoiceGuessResult.CORRECT);
        await this.guessSong(
            messageContext,
            this.guildPreference.gameOptions.guessModeType !==
                GuessModeType.ARTIST
                ? round.song.songName
                : round.song.artistName,
            createdAt,
        );
        return MultipleChoiceGuessResult.CORRECT;
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
     * Sync scoreboard with current VC members.
     * Sequential iteration prevents concurrent addPlayer/setPlayerInVC interleaving.
     */
    async syncAllVoiceMembers(): Promise<void> {
        const currentVoiceMemberIds = getCurrentVoiceMembers(
            this.voiceChannelID,
        ).map((x) => x.id);

        const departedPlayers = this.scoreboard
            .getPlayerIDs()
            .filter((x) => !currentVoiceMemberIds.includes(x));

        for (const player of departedPlayers) {
            // eslint-disable-next-line no-await-in-loop
            await this.setPlayerInVC(player, false);
        }

        if (this.gameType === GameType.TEAMS) {
            return;
        }

        const newPlayers = currentVoiceMemberIds.filter(
            (x) => x !== process.env.BOT_CLIENT_ID,
        );

        for (const playerId of newPlayers) {
            // eslint-disable-next-line no-await-in-loop
            const firstGameOfDay = await isFirstGameOfDay(playerId);
            // eslint-disable-next-line no-await-in-loop
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
                    : Player.fromUser(player, this.guildID, 0, firstGameOfDay),
            );
        }
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

        const guildId =
            messageOrInteraction instanceof Eris.CommandInteraction
                ? messageOrInteraction.guild?.id
                : messageOrInteraction.guildID;

        let footerText = i18n.translate(
            guildId as string,
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
                guildId as string,
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
                guildId as string,
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
                guildId as string,
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
                    guildId as string,
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

        if (KmqConfiguration.Instance.activityReducedEmbeds()) {
            await this.sendActivityReducedEndGame(footerText);
            return;
        }

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

            const recapField = this.buildRecapEmbedField();
            if (recapField) {
                fields.push(recapField);
            }

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
                    actionRows: [
                        {
                            type: Eris.Constants.ComponentTypes.ACTION_ROW,
                            components: [
                                {
                                    style: Eris.Constants.ButtonStyles.LINK,
                                    url: VOTE_LINK,
                                    type: Eris.Constants.ComponentTypes.BUTTON,
                                    emoji: { name: "✅" },
                                    label: i18n.translate(
                                        this.guildID,
                                        "misc.interaction.vote",
                                    ),
                                },
                                {
                                    style: Eris.Constants.ButtonStyles.LINK,
                                    url: REVIEW_LINK,
                                    type: Eris.Constants.ComponentTypes.BUTTON,
                                    emoji: { name: "📖" },
                                    label: i18n.translate(
                                        this.guildID,
                                        "misc.interaction.leaveReview",
                                    ),
                                },
                                {
                                    style: Eris.Constants.ButtonStyles.LINK,
                                    url: "https://discord.gg/RCuzwYV",
                                    type: Eris.Constants.ComponentTypes.BUTTON,
                                    emoji: { name: "🎵" },
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
            : new GameRound(randomSong, this.calculateBaseExp(), this.guildID);

        return gameRound;
    }

    /**
     * Lifecycle hook overrides: bypass the mutex for calls originating from
     * within startRoundCore/endRoundCore/endSessionCore (which already hold it).
     * Without these, the non-re-entrant mutex would deadlock.
     * @param reason - The reason for the session end
     * @param endedDueToError - Whether the session ended due to an error
     */
    protected async endSessionFromLifecycle(
        reason: string,
        endedDueToError: boolean,
    ): Promise<void> {
        await this.endSessionCore(reason, endedDueToError);
    }

    /**
     * @param isError - Whether the round ended due to an error
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    protected async endRoundFromLifecycle(
        isError: boolean,
        messageContext: MessageContext,
    ): Promise<void> {
        await this.endRoundCore(isError, messageContext);
    }

    /**
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    protected async startRoundFromLifecycle(
        messageContext: MessageContext,
    ): Promise<Round | null> {
        return this.startRoundCore(messageContext);
    }

    /**
     * Formats the recap as an embed field for the legacy end-game message, or
     * null when there's nothing noteworthy to show.
     * @returns the recap field, or null
     */
    private buildRecapEmbedField(): {
        name: string;
        value: string;
        inline: boolean;
    } | null {
        const recap = this.buildRecap();
        const lines: string[] = [];

        if (recap.mvp) {
            lines.push(
                i18n.translate(this.guildID, "misc.recap.mvp", {
                    user: this.scoreboard.getPlayerDisplayedName(
                        recap.mvp.userID,
                    ),
                    score: friendlyFormattedNumber(recap.mvp.score),
                }),
            );
        }

        if (recap.fastestGuess) {
            lines.push(
                i18n.translate(this.guildID, "misc.recap.fastest", {
                    user: this.scoreboard.getPlayerDisplayedName(
                        recap.fastestGuess.userID,
                    ),
                    seconds: (recap.fastestGuess.timeMs / 1000).toFixed(1),
                }),
            );
        }

        if (recap.longestStreak) {
            lines.push(
                i18n.translate(this.guildID, "misc.recap.streak", {
                    user: this.scoreboard.getPlayerDisplayedName(
                        recap.longestStreak.userID,
                    ),
                    streak: friendlyFormattedNumber(recap.longestStreak.streak),
                }),
            );
        }

        if (lines.length === 0) {
            return null;
        }

        return {
            name: i18n.translate(this.guildID, "misc.recap.title"),
            value: lines.join("\n"),
            inline: false,
        };
    }

    /**
     * Phase-5 compact round reveal: a single line with song, artist, and
     * who got it (if anyone), pointing users at the Activity for the full
     * reveal. Activity subscribers already have the rich reveal rendered
     * in the iframe, so the channel message just needs to stay out of the
     * way for the rest of the guild.
     * @param messageContext - the round's message context
     * @param round - the ending round
     * @param playerRoundResults - winners (possibly empty) for the round
     * @param embedColor - color to preserve the correct/incorrect hue
     */
    private async sendActivityReducedRoundReveal(
        messageContext: MessageContext,
        round: GameRound,
        playerRoundResults: Array<PlayerRoundResult>,
        embedColor: number | undefined,
    ): Promise<void> {
        const locale = State.getGuildLocale(this.guildID);
        const song = round.song.getLocalizedSongName(locale);
        const artist = round.song.getLocalizedArtistName(locale);
        const winner =
            playerRoundResults.length > 0
                ? playerRoundResults
                      .map((r) => getMention(r.player.id))
                      .join(", ")
                : "";

        await sendInfoMessage(messageContext, {
            color: embedColor,
            title: i18n.translate(this.guildID, "misc.inGame.roundNumber", {
                roundNum: String(this.roundsPlayed + 1),
            }),
            description: i18n.translate(
                this.guildID,
                playerRoundResults.length > 0
                    ? "misc.inGame.activityRoundRevealCorrect"
                    : "misc.inGame.activityRoundRevealNoCorrect",
                { song, artist, winner },
            ),
        });
    }

    /**
     * Phase-5 compact end-of-game message. Wins / ties / no-winner states
     * are still distinguishable, but the scoreboard and level-ups live in
     * the Activity instead of a multi-field embed.
     * @param footerText - localized "X/Y songs correctly guessed" footer
     *  reused from the full embed so stats stay visible.
     */
    private async sendActivityReducedEndGame(
        footerText: string,
    ): Promise<void> {
        const winners = this.scoreboard.getWinners();
        if (winners.length === 0) {
            await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    title: i18n.translate(
                        this.guildID,
                        "misc.inGame.noWinners",
                    ),
                    description: i18n.translate(
                        this.guildID,
                        "misc.inGame.activitySessionEndNoWinners",
                        { footer: footerText },
                    ),
                },
            );
            return;
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
                color: EMBED_SUCCESS_COLOR,
                title: `🎉 ${winnerMessage} 🎉`,
                description: i18n.translate(
                    this.guildID,
                    "misc.inGame.activitySessionEndWinners",
                    { winnerMessage, footer: footerText },
                ),
            },
        );
    }

    /**
     * Internal startRound logic. Must only be called while holding lifecycleMutex.
     * @param messageContext - The message context for the round
     */
    private async startRoundCore(
        messageContext: MessageContext,
    ): Promise<Round | null> {
        const isEndToEndBotRun =
            messageContext.author.id === process.env.END_TO_END_TEST_BOT_CLIENT;

        const multiGuessDelayMs = isEndToEndBotRun
            ? 0
            : this.guildPreference.getMultiGuessDelay() * 1000;

        const songStartDelayMs = isEndToEndBotRun
            ? 0
            : this.guildPreference.getSongStartDelay() * 1000;

        // Only wait out the song-start delay when we're actually going to start
        // a round. endRoundCore() already chains startRoundCore() to begin the
        // next round, so guessSong's explicit startRound() in the "everybody
        // guessed, nobody correct" path is usually redundant — a round already
        // exists. Without skipping the delay here, that redundant call would
        // hold the lifecycleMutex for the full song-start delay before the guard
        // below bails, blocking the next round's endRound() (i.e. the next
        // guess) for ~songStartDelay seconds.
        if (
            this.sessionInitialized &&
            !this.finished &&
            !this.round &&
            !this.pendingEndSession
        ) {
            // Only add a delay if the game has already started
            await delay(
                this.multiguessDelayIsActive(this.guildPreference)
                    ? Math.max(songStartDelayMs - multiGuessDelayMs, 0)
                    : songStartDelayMs,
            );
        }

        if (this.finished || this.round || this.pendingEndSession) {
            return null;
        }

        const round = await super.startRound(messageContext);

        if (!round) {
            return null;
        }

        await this.sendStartRoundMessage(messageContext, round, true);

        return round;
    }

    /**
     * Internal endRound logic. Must only be called while holding lifecycleMutex.
     * @param isError - Whether the round ended due to an error
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param gameRound - The round to end
     */
    private async endRoundCore(
        isError: boolean,
        messageContext: MessageContext,
        gameRound?: GameRound,
    ): Promise<void> {
        // if round ending due to correct song guess, ensure that we are operating on the provided
        // game round to ensure we don't end the same round twice (since this.round is modified)
        let round = gameRound ?? this.round;
        if (!round) {
            round = this.round;
        }

        // wait and accept multiguess results
        await delay(
            this.multiguessDelayIsActive(this.guildPreference)
                ? this.guildPreference.getMultiGuessDelay() * 1000
                : 0,
        );

        // ensure that only one invocation can proceed
        if (!round || round.finished) {
            return;
        }

        round.finished = true;

        if (this.pendingEndSession) {
            // Session end was requested while we held the mutex — skip round scoring/messages
            // and leave the state at ROUND_ACTIVE so endSession can transition directly to ENDING.
            this.round = null;
            this.stopGuessTimeout();
            return;
        }

        // sets the round to null
        await super.endRound(false, messageContext);

        if (round.songStartedAt === null) {
            return;
        }

        const correctGuessers = round.getCorrectGuessers(this.isHiddenMode());
        const isCorrectGuess = correctGuessers.length > 0;
        if (isCorrectGuess) {
            this.correctGuesses++;
        }

        if (this.dailyChallenge) {
            this.updateDailyPlayerStats(correctGuessers.map((g) => g.id));
        }

        await this.stopHiddenUpdateTimer();

        try {
            await round.interactionMarkAnswers(correctGuessers.length, true);
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

            // Track session-best stats for the end-game recap.
            if (
                this.longestStreak === null ||
                this.lastGuesser.streak > this.longestStreak.streak
            ) {
                this.longestStreak = {
                    userID: this.lastGuesser.userID,
                    streak: this.lastGuesser.streak,
                };
            }

            if (
                this.fastestGuess === null ||
                timePlayed < this.fastestGuess.timeMs
            ) {
                this.fastestGuess = {
                    userID: correctGuessers[0]!.id,
                    timeMs: timePlayed,
                };
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

        this.emit("roundEnd", {
            song: round.song,
            correctGuessers,
            playerRoundResults: round.playerRoundResults,
            isCorrectGuess,
            guesses: round.getGuesses(),
        });

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

        if (KmqConfiguration.Instance.activityReducedEmbeds()) {
            await this.sendActivityReducedRoundReveal(
                messageContext,
                round,
                playerRoundResults,
                embedColor,
            );
        } else {
            await this.sendRoundMessage(
                messageContext,
                fields,
                round,
                description,
                embedColor,
                correctGuess && !this.isMultipleChoiceMode(),
                remainingDuration,
            );
        }

        const gameFinishedDueToGameOptions = this.scoreboard.gameFinished(
            this.guildPreference,
        );

        const gameFinishedDueToSuddenDeath =
            this.gameType === GameType.SUDDEN_DEATH && !isCorrectGuess;

        // Daily Challenge ends after a fixed number of rounds (roundsPlayed was
        // just bumped in super.endRound for the round that ended).
        const gameFinishedDueToDaily =
            this.dailyChallenge && this.roundsPlayed >= DAILY_CHALLENGE_ROUNDS;

        const gameFinished =
            gameFinishedDueToGameOptions ||
            gameFinishedDueToSuddenDeath ||
            gameFinishedDueToDaily;

        if (this.isClipMode() && !gameFinished) {
            // Play what immediately follows the clip after the round ends
            const songStartDelay = this.guildPreference.getSongStartDelay();
            if (songStartDelay > 0 && !isError) {
                const playSuccess = await this.playSong(
                    messageContext,
                    round,
                    ClipAction.END_ROUND,
                );

                if (playSuccess) {
                    await delay(songStartDelay * 1000);
                }
            }
        }

        if (gameFinishedDueToGameOptions) {
            await this.endSessionCore(
                "Game finished due to game options",
                false,
            );
        } else if (gameFinishedDueToSuddenDeath) {
            await this.endSessionCore("Sudden death game ended", false);
        } else if (gameFinishedDueToDaily) {
            await this.endSessionCore("Daily challenge complete", false);
        }

        await this.startRoundCore(messageContext);
    }

    /**
     * Internal endSession logic. Must only be called while holding lifecycleMutex.
     * @param reason - The reason for the game session end
     * @param endedDueToError - Whether the session ended due to an error
     */
    private async endSessionCore(
        reason: string,
        endedDueToError: boolean,
    ): Promise<void> {
        if (this.finished) {
            return;
        }

        this.finished = true;
        // Emit recap before sessionEnd: both are synchronous, so the Activity
        // bridge handles them before its sessionEnd teardown (scheduled via
        // setImmediate) runs.
        this.emit("recap", this.buildRecap());
        this.emit("sessionEnd", { reason });
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
                .sort((a, b) => {
                    const levelsGainedDiff =
                        b.endLevel - b.startLevel - (a.endLevel - a.startLevel);

                    return levelsGainedDiff !== 0
                        ? levelsGainedDiff
                        : b.endLevel - a.endLevel;
                })
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

        if (this.dailyChallenge) {
            await this.persistDailyChallengeResults();
        }

        // commit session's song plays and correct guesses
        if (!this.isMultipleChoiceMode()) {
            await this.storeSongStats();
        }

        await super.endSession(reason, endedDueToError);
        await this.sendEndGameMessage();
        State.runningStats.gamesPlayed += 1;
        State.runningStats.roundsPlayed += this.roundsPlayed;

        logger.info(
            `gid: ${this.guildID} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`,
        );
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

    /**
     * Accumulates Daily Challenge per-player tallies for the round that just
     * ended: correct guessers extend their streak, everyone else resets.
     * @param correctUserIDs - IDs of players who guessed this round correctly
     */
    private updateDailyPlayerStats(correctUserIDs: string[]): void {
        const correct = new Set(correctUserIDs);
        for (const player of this.scoreboard.getPlayers()) {
            const entry = this.dailyPlayerStats.get(player.id) ?? {
                correct: 0,
                currentStreak: 0,
                bestStreak: 0,
            };

            if (correct.has(player.id)) {
                entry.correct += 1;
                entry.currentStreak += 1;
                entry.bestStreak = Math.max(
                    entry.bestStreak,
                    entry.currentStreak,
                );
            } else {
                entry.currentStreak = 0;
            }

            this.dailyPlayerStats.set(player.id, entry);
        }
    }

    /**
     * Writes one daily_challenge_results row per participant. Idempotent per
     * (player, date) via the unique constraint (ignore re-inserts) so a replay
     * or a second worker can't overwrite a player's completed result.
     */
    private async persistDailyChallengeResults(): Promise<void> {
        if (!this.dailyChallenge || this.dailyChallengeDate === null) {
            return;
        }

        const completedAt = new Date();
        const challengeDate = dailyChallengeDateValue(this.dailyChallengeDate);
        await Promise.all(
            this.scoreboard.getPlayers().map((player) => {
                const stats = this.dailyPlayerStats.get(player.id) ?? {
                    correct: 0,
                    currentStreak: 0,
                    bestStreak: 0,
                };

                return dbContext.kmq
                    .insertInto("daily_challenge_results")
                    .ignore()
                    .values({
                        player_id: player.id,
                        challenge_date: challengeDate,
                        score: player.getScore(),
                        correct_count: stats.correct,
                        total_count: DAILY_CHALLENGE_ROUNDS,
                        best_streak: stats.bestStreak,
                        completed_at: completedAt,
                    })
                    .execute();
            }),
        );
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
                    .filter((x) => x.inVC).length,
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
                exp: 0,
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

        songStats.roundsPlayed++;
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
        this.emit("scoreboardUpdate");
    }

    private startHiddenUpdateTimer(): void {
        this.hiddenUpdateTimer = setInterval(async () => {
            await this.updateGuessedMembersMessage();
        }, HIDDEN_UPDATE_INTERVAL);
    }

    private async stopHiddenUpdateTimer(): Promise<void> {
        if (this.hiddenUpdateTimer) {
            clearInterval(this.hiddenUpdateTimer);
            this.hiddenUpdateTimer = null;
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
        let timestamp: number;
        if (this.isClipMode()) {
            timestamp = Math.ceil(
                (round.songStartedAt! +
                    (CLIP_MAX_REPLAY_COUNT + 1) *
                        (this.clipDurationLength! * 1000 +
                            CLIP_PADDING_BEGINNING_MS +
                            CLIP_LAST_REPLAY_DELAY_MS +
                            CLIP_VC_END_TIMEOUT_MS)) /
                    1000,
            );
        } else {
            timestamp = Math.floor(
                (round.timerStartedAt +
                    this.guildPreference.gameOptions.guessTimeout! * 1000) /
                    1000,
            );
        }

        const hiddenTimerInfo = i18n.translate(
            this.guildID,
            "misc.inGame.hiddenTimerInfo",
            {
                guessButton: clickableSlashCommand("guess"),
                timestamp: `<t:${timestamp}:R>`,
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

    /**
     * @param reuseExistingChoices - Whether to reuse the existing multiple choice options
     * Sends a message with multiple choice options for the current round
     */
    private async sendMultipleChoiceOptionsMessage(
        reuseExistingChoices: boolean,
    ): Promise<void> {
        const locale = State.getGuildLocale(this.guildID);
        const round = this.round;
        if (!round) {
            return;
        }

        const answerType = this.guildPreference.gameOptions.answerType;
        // Reuse the choices previously generated for this exact answer type if
        // they exist — this keeps the same options, order, and answer UUIDs
        // when toggling typing <-> MC or cycling between MC difficulties within
        // a round, so players can't switch difficulty to deduce the answer.
        const cached = reuseExistingChoices
            ? round.multipleChoiceCache[answerType]
            : undefined;

        let buttons: Array<Eris.InteractionButton>;
        if (cached) {
            buttons = cached.buttons;
            round.interactionCorrectAnswerUUID = cached.correctAnswerUUID;
            round.interactionIncorrectAnswerUUIDs = cached.incorrectAnswerUUIDs;
        } else {
            buttons = [];
            const incorrectAnswerUUIDs: { [uuid: string]: number } = {};
            const randomSong = round.song;
            const correctChoice = {
                displayedName:
                    this.guildPreference.gameOptions.guessModeType ===
                    GuessModeType.ARTIST
                        ? round.song.getLocalizedArtistName(locale)
                        : round.song.getLocalizedSongName(locale),
                song: randomSong,
            };

            const wrongChoices = await getMultipleChoiceOptions(
                answerType,
                this.guildPreference.gameOptions.guessModeType,
                randomSong.members,
                correctChoice,
                locale,
            );

            for (const choice of wrongChoices) {
                const id = uuid.v4();
                incorrectAnswerUUIDs[id] = 0;
                buttons.push({
                    type: 2,
                    style: 1,
                    label: choice.substring(0, 70),
                    custom_id: id,
                });
            }

            const correctAnswerUUID = uuid.v4() as string;
            buttons.push({
                type: Eris.Constants.ComponentTypes.BUTTON,
                style: Eris.Constants.ButtonStyles.PRIMARY,
                label: correctChoice.displayedName.substring(0, 70),
                custom_id: correctAnswerUUID,
            });

            buttons = _.shuffle(buttons);

            round.interactionCorrectAnswerUUID = correctAnswerUUID;
            round.interactionIncorrectAnswerUUIDs = incorrectAnswerUUIDs;
            // Cache this difficulty's set so a later switch back to it restores
            // the identical options/order rather than regenerating.
            round.multipleChoiceCache[answerType] = {
                buttons,
                correctAnswerUUID,
                incorrectAnswerUUIDs,
            };
        }

        // Mark the active set so the Activity bridge can read it for its
        // snapshot.
        round.multipleChoiceOptions = buttons;

        // Notify the Activity of the current round's choices. Fires both at
        // round start and on a mid-round switch to multiple choice (this
        // method is the single funnel for both). The correct answer isn't
        // marked — clients only see labels + ids.
        this.emit("roundChoices", {
            roundIndex: this.getRoundsPlayed(),
            choices: buttons.map((button) => ({
                id: button.custom_id,
                label: button.label ?? "",
            })),
        });

        let actionRows: Array<ButtonActionRow>;
        switch (this.guildPreference.gameOptions.answerType) {
            case AnswerType.MULTIPLE_CHOICE_EASY:
                actionRows = [
                    {
                        type: Eris.Constants.ComponentTypes.ACTION_ROW,
                        components: buttons,
                    },
                ];
                break;
            case AnswerType.MULTIPLE_CHOICE_MED:
                actionRows = chunkArray(buttons, 3).map((x) => ({
                    type: Eris.Constants.ComponentTypes.ACTION_ROW,
                    components: x,
                }));
                break;
            case AnswerType.MULTIPLE_CHOICE_HARD:
                actionRows = chunkArray(buttons, 4).map((x) => ({
                    type: Eris.Constants.ComponentTypes.ACTION_ROW,
                    components: x,
                }));
                break;
            default:
                logger.error(
                    `Unexpected answerType: ${this.guildPreference.gameOptions.answerType}`,
                );

                actionRows = [
                    {
                        type: Eris.Constants.ComponentTypes.ACTION_ROW,
                        components: buttons,
                    },
                ];
                break;
        }

        const lastRow: Eris.InteractionButton[] = [
            Session.generateBookmarkButton(round, locale),
            Session.generateSkipButton(round, locale),
        ];

        actionRows.push({
            type: Eris.Constants.ComponentTypes.ACTION_ROW,
            components: lastRow,
        });

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
                actionRows,
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
        });

        this.startHiddenUpdateTimer();
    }

    private async sendStartRoundMessage(
        messageContext: MessageContext,
        round: Round,
        firstMessageOfRound: boolean,
    ): Promise<void> {
        if (this.isHiddenMode()) {
            // Show players that haven't guessed and a button to guess
            await this.sendHiddenGuessMessage(
                messageContext,
                round as GameRound,
            );
        } else if (this.isMultipleChoiceMode()) {
            await this.sendMultipleChoiceOptionsMessage(!firstMessageOfRound);
        }
    }
}
