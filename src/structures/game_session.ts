/* eslint-disable no-return-assign */
import Eris from "eris";
import _ from "lodash";
import * as uuid from "uuid";

import dbContext from "../database_context";
import {
    getDebugLogHeader,
    sendInfoMessage,
    getNumParticipants,
    getUserVoiceChannel,
    sendEndGameMessage,
    getCurrentVoiceMembers,
    tryInteractionAcknowledge,
    tryCreateInteractionErrorAcknowledgement,
    getMention,
    getGuildLocale,
    sendRoundMessage,
} from "../helpers/discord_utils";
import {
    getGuildPreference,
    getLocalizedArtistName,
    getLocalizedSongName,
    getMultipleChoiceOptions,
    isFirstGameOfDay,
    isUserPremium,
    userBonusIsActive,
} from "../helpers/game_utils";
import {
    delay,
    getOrdinalNum,
    setDifference,
    codeLine,
    chunkArray,
} from "../helpers/utils";
import State from "../state";

import { IPCLogger } from "../logger";
import GameRound from "./game_round";
import type GuildPreference from "./guild_preference";
import Scoreboard from "./scoreboard";
import EliminationScoreboard from "./elimination_scoreboard";
import TeamScoreboard from "./team_scoreboard";
import { getRankNameByLevel } from "../commands/game_commands/profile";
import EliminationPlayer from "./elimination_player";
import { KmqImages, SONG_START_DELAY } from "../constants";
import MessageContext from "./message_context";
import KmqMember from "./kmq_member";
import { calculateTotalRoundExp } from "../commands/game_commands/exp";
import Player from "../structures/player";
import Session from "./session";
import type Round from "./round";
import type QueriedSong from "../interfaces/queried_song";
import type GuessResult from "../interfaces/guess_result";
import SuccessfulGuessResult from "../interfaces/success_guess_result";
import { GuessModeType } from "../enums/option_types/guess_mode_type";
import { AnswerType } from "../enums/option_types/answer_type";
import { MultiGuessType } from "../enums/option_types/multiguess_type";
import { GameType } from "../enums/game_type";

const MULTIGUESS_DELAY = 1500;

const logger = new IPCLogger("game_session");

const EXP_TABLE = [...Array(1000).keys()].map((level) => {
    if (level === 0 || level === 1) return 0;
    return 10 * level ** 2 + 200 * level - 200;
});

export const CUM_EXP_TABLE = EXP_TABLE.map(
    (
        (sum) => (value) =>
            (sum += value)
    )(0)
);

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
    public round: GameRound;

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
    private lastGuesser: LastGuesser;

    constructor(
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember,
        gameType: GameType,
        eliminationLives?: number
    ) {
        super(textChannelID, voiceChannelID, guildID, gameSessionCreator);
        this.gameType = gameType;
        this.sessionInitialized = false;
        this.correctGuesses = 0;
        this.guessTimes = [];
        this.finished = false;
        this.round = null;
        this.songStats = {};
        this.lastGuesser = null;

        switch (this.gameType) {
            case GameType.TEAMS:
                this.scoreboard = new TeamScoreboard();
                break;
            case GameType.ELIMINATION:
                this.scoreboard = new EliminationScoreboard(eliminationLives);
                break;
            default:
                this.scoreboard = new Scoreboard();
                break;
        }

        this.syncAllVoiceMembers();
    }

    /**
     * Starting a new GameRound
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        await delay(
            this.multiguessDelayIsActive(guildPreference)
                ? SONG_START_DELAY - MULTIGUESS_DELAY
                : SONG_START_DELAY
        );
        if (this.finished || this.round) {
            return;
        }

        await super.startRound(guildPreference, messageContext);
        if (guildPreference.isMultipleChoiceMode()) {
            const locale = getGuildLocale(this.guildID);
            const randomSong = this.round.song;
            const correctChoice =
                guildPreference.gameOptions.guessModeType ===
                GuessModeType.ARTIST
                    ? getLocalizedArtistName(this.round.song, locale)
                    : getLocalizedSongName(this.round.song, locale, false);

            const wrongChoices = await getMultipleChoiceOptions(
                guildPreference.gameOptions.answerType,
                guildPreference.gameOptions.guessModeType,
                randomSong.members,
                correctChoice,
                randomSong.artistID,
                locale
            );

            let buttons: Array<Eris.InteractionButton> = [];
            for (const choice of wrongChoices) {
                const id = uuid.v4();
                this.round.interactionIncorrectAnswerUUIDs[id] = 0;
                buttons.push({
                    type: 2,
                    style: 1,
                    label: choice.substring(0, 70),
                    custom_id: id,
                });
            }

            this.round.interactionCorrectAnswerUUID = uuid.v4();
            buttons.push({
                type: 2,
                style: 1,
                label: correctChoice.substring(0, 70),
                custom_id: this.round.interactionCorrectAnswerUUID,
            });

            buttons = _.shuffle(buttons);

            let components: Array<Eris.ActionRow>;
            switch (guildPreference.gameOptions.answerType) {
                case AnswerType.MULTIPLE_CHOICE_EASY:
                    components = [
                        {
                            type: 1,
                            components: buttons,
                        },
                    ];
                    break;
                case AnswerType.MULTIPLE_CHOICE_MED:
                    components = chunkArray(buttons, 3).map((x) => ({
                        type: 1,
                        components: x,
                    }));
                    break;
                case AnswerType.MULTIPLE_CHOICE_HARD:
                    components = chunkArray(buttons, 4).map((x) => ({
                        type: 1,
                        components: x,
                    }));
                    break;
                default:
                    break;
            }

            this.round.interactionComponents = components;

            this.round.interactionMessage = await sendInfoMessage(
                new MessageContext(this.textChannelID),
                {
                    title: State.localizer.translate(
                        this.guildID,
                        "misc.interaction.guess.title",
                        {
                            songOrArtist:
                                guildPreference.gameOptions.guessModeType ===
                                GuessModeType.ARTIST
                                    ? State.localizer.translate(
                                          this.guildID,
                                          "misc.artist"
                                      )
                                    : State.localizer.translate(
                                          this.guildID,
                                          "misc.song"
                                      ),
                        }
                    ),
                    components,
                    thumbnailUrl: KmqImages.LISTENING,
                }
            );
        }
    }

    /**
     * Ends an active GameRound
     * @param guildPreference - The GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param guessResult - Whether the round ended via a correct guess (includes exp gain), or other (timeout, error, etc)
     */
    async endRound(
        guildPreference: GuildPreference,
        messageContext?: MessageContext,
        guessResult?: GuessResult
    ): Promise<void> {
        if (this.round === null) {
            return;
        }

        const round = this.round;

        round.interactionMarkAnswers(guessResult.correctGuessers?.length);

        const timePlayed = Date.now() - round.startedAt;
        if (guessResult.correct) {
            // update guessing streaks
            if (
                this.lastGuesser === null ||
                this.lastGuesser.userID !== guessResult.correctGuessers[0].id
            ) {
                this.lastGuesser = {
                    userID: guessResult.correctGuessers[0].id,
                    streak: 1,
                };
            } else {
                this.lastGuesser.streak++;
            }

            this.guessTimes.push(timePlayed);
            await this.updateScoreboard(
                guessResult,
                guildPreference,
                timePlayed,
                messageContext
            );
        } else {
            if (!guessResult.error) {
                this.lastGuesser = null;
                if (this.gameType === GameType.ELIMINATION) {
                    const eliminationScoreboard = this
                        .scoreboard as EliminationScoreboard;

                    eliminationScoreboard.decrementAllLives();
                }
            }
        }

        this.incrementSongStats(
            round.song.youtubeLink,
            guessResult.correct,
            round.skipAchieved,
            round.hintUsed,
            timePlayed
        );

        const remainingDuration = this.getRemainingDuration(guildPreference);
        if (messageContext) {
            const endRoundMessage = await sendRoundMessage(
                messageContext,
                this.scoreboard,
                this,
                guildPreference.gameOptions.guessModeType,
                guildPreference.isMultipleChoiceMode(),
                remainingDuration,
                this.songSelector.getUniqueSongCounter(guildPreference)
            );

            round.roundMessageID = endRoundMessage?.id;
        }

        this.updateBookmarkSongList();
        await super.endRound(guildPreference, messageContext);

        if (this.scoreboard.gameFinished(guildPreference)) {
            this.endSession();
        }
    }

    /**
     * Ends the current GameSession
     */
    async endSession(): Promise<void> {
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
                            name: x.name,
                            id: x.id,
                            score: x.getDisplayedScore(),
                        }))
                )
            );
        }

        const leveledUpPlayers: Array<LevelUpResult> = [];
        // commit player stats
        for (const participant of this.scoreboard.getPlayerIDs()) {
            await this.ensurePlayerStat(participant);
            await GameSession.incrementPlayerGamesPlayed(participant);
            const playerScore = this.scoreboard.getPlayerScore(participant);
            if (playerScore > 0) {
                await GameSession.incrementPlayerSongsGuessed(
                    participant,
                    playerScore
                );
            }

            const playerExpGain = this.scoreboard.getPlayerExpGain(participant);
            let levelUpResult: LevelUpResult;
            if (playerExpGain > 0) {
                levelUpResult = await GameSession.incrementPlayerExp(
                    participant,
                    playerExpGain
                );
                if (levelUpResult) {
                    leveledUpPlayers.push(levelUpResult);
                }
            }

            await GameSession.insertPerSessionStats(
                participant,
                playerScore,
                playerExpGain,
                levelUpResult
                    ? levelUpResult.endLevel - levelUpResult.startLevel
                    : 0
            );
        }

        // send level up message
        if (leveledUpPlayers.length > 0) {
            const levelUpMessages = leveledUpPlayers
                .sort((a, b) => b.endLevel - a.endLevel)
                .sort(
                    (a, b) =>
                        b.endLevel - b.startLevel - (a.endLevel - a.startLevel)
                )
                .map((leveledUpPlayer) =>
                    State.localizer.translate(
                        this.guildID,
                        "misc.levelUp.entry",
                        {
                            user: getMention(leveledUpPlayer.userID),
                            startLevel: codeLine(
                                String(leveledUpPlayer.startLevel)
                            ),
                            endLevel: codeLine(
                                String(leveledUpPlayer.endLevel)
                            ),
                            rank: codeLine(
                                getRankNameByLevel(
                                    leveledUpPlayer.endLevel,
                                    this.guildID
                                )
                            ),
                        }
                    )
                )
                .slice(0, 10);

            if (leveledUpPlayers.length > 10) {
                levelUpMessages.push(
                    State.localizer.translate(
                        this.guildID,
                        "misc.andManyOthers"
                    )
                );
            }

            sendInfoMessage(new MessageContext(this.textChannelID), {
                title: State.localizer.translate(
                    this.guildID,
                    "misc.levelUp.title"
                ),
                description: levelUpMessages.join("\n"),
                thumbnailUrl: KmqImages.THUMBS_UP,
            });
        }

        // commit guild's game session
        const sessionLength = (Date.now() - this.startedAt) / (1000 * 60);
        const averageGuessTime =
            this.guessTimes.length > 0
                ? this.guessTimes.reduce((a, b) => a + b, 0) /
                  (this.guessTimes.length * 1000)
                : -1;

        await dbContext.kmq("game_sessions").insert({
            start_date: new Date(this.startedAt),
            guild_id: this.guildID,
            num_participants: this.scoreboard.getPlayers().map((x) => x.inVC)
                .length,
            avg_guess_time: averageGuessTime,
            session_length: sessionLength,
            rounds_played: this.roundsPlayed,
            correct_guesses: this.correctGuesses,
        });

        // commit session's song plays and correct guesses
        const guildPreference = await getGuildPreference(this.guildID);
        if (!guildPreference.isMultipleChoiceMode()) {
            await this.storeSongStats();
        }

        await super.endSession();
        await sendEndGameMessage(this);

        logger.info(
            `gid: ${this.guildID} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`
        );
    }

    /**
     * Process a message to see if it is a valid and correct guess
     * @param messageContext - The context of the message to check
     * @param guess - the content of the message to check
     */
    async guessSong(
        messageContext: MessageContext,
        guess: string
    ): Promise<void> {
        if (!this.connection) return;
        if (this.connection.listenerCount("end") === 0) return;
        if (!this.round) return;
        if (!this.guessEligible(messageContext)) return;

        const guildPreference = await getGuildPreference(this.guildID);

        const pointsEarned = this.checkGuess(
            messageContext.author.id,
            guess,
            guildPreference.gameOptions.guessModeType,
            guildPreference.isMultipleChoiceMode(),
            guildPreference.typosAllowed()
        );

        if (pointsEarned > 0) {
            if (this.round.finished) {
                return;
            }

            this.round.finished = true;
            await delay(
                this.multiguessDelayIsActive(guildPreference)
                    ? MULTIGUESS_DELAY
                    : 0
            );
            if (!this.round) return;

            // mark round as complete, so no more guesses can go through
            await this.endRound(guildPreference, messageContext, {
                correct: true,
                correctGuessers: this.round.correctGuessers,
            });
            this.correctGuesses++;

            // update game session's lastActive
            this.lastActiveNow();

            this.stopGuessTimeout();

            // increment guild's song guess count
            await dbContext
                .kmq("guilds")
                .where("guild_id", this.guildID)
                .increment("songs_guessed", 1);

            this.startRound(guildPreference, messageContext);
        } else if (guildPreference.isMultipleChoiceMode()) {
            if (!this.round) return;
            if (
                setDifference(
                    [
                        ...new Set(
                            getCurrentVoiceMembers(this.voiceChannelID).map(
                                (x) => x.id
                            )
                        ),
                    ],
                    [...this.round.incorrectMCGuessers]
                ).size === 0
            ) {
                await this.endRound(
                    guildPreference,
                    new MessageContext(this.textChannelID, null, this.guildID),
                    { correct: false }
                );

                this.startRound(
                    await getGuildPreference(this.guildID),
                    messageContext
                );
            }
        }
    }

    getCorrectGuesses(): number {
        return this.correctGuesses;
    }

    /** Updates owner to the first player to join the game that didn't leave VC */
    updateOwner(): void {
        if (this.finished) {
            return;
        }

        const voiceMembers = getCurrentVoiceMembers(this.voiceChannelID).filter(
            (x) => x.id !== process.env.BOT_CLIENT_ID
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

        this.owner = KmqMember.fromUser(
            voiceMembers.find((x) => x.id === newOwnerID)
        );

        super.updateOwner();
    }

    async handleMultipleChoiceInteraction(
        interaction: Eris.ComponentInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        if (
            !this.handleInSessionInteractionFailures(
                interaction,
                messageContext
            )
        ) {
            return;
        }

        if (this.round.incorrectMCGuessers.has(interaction.member.id)) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                State.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.alreadyEliminated"
                )
            );
            return;
        }

        if (
            !this.round.isCorrectInteractionAnswer(interaction.data.custom_id)
        ) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                State.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.eliminated"
                )
            );

            this.round.incorrectMCGuessers.add(interaction.member.id);
            this.round.interactionIncorrectAnswerUUIDs[
                interaction.data.custom_id
            ]++;

            // Add the user as a participant
            this.guessSong(messageContext, "");
            return;
        }

        tryInteractionAcknowledge(interaction);

        const guildPreference = await getGuildPreference(
            messageContext.guildID
        );

        if (!this.round) return;
        this.guessSong(
            messageContext,
            guildPreference.gameOptions.guessModeType !== GuessModeType.ARTIST
                ? this.round.song.songName
                : this.round.song.artistName
        );
    }

    /**
     * Whether the current game session has premium features
     * @returns whether the session is premium
     */
    isPremium(): boolean {
        return this.scoreboard
            .getPlayers()
            .filter((x) => x.inVC)
            .some((x) => x.premium);
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

        if (
            inVC &&
            !this.scoreboard.getPlayerIDs().includes(userID) &&
            this.gameType !== GameType.TEAMS
        ) {
            this.scoreboard.addPlayer(
                this.gameType === GameType.ELIMINATION
                    ? EliminationPlayer.fromUserID(
                          userID,
                          (
                              this.scoreboard as EliminationScoreboard
                          ).getLivesOfWeakestPlayer(),
                          await isFirstGameOfDay(userID),
                          await isUserPremium(userID)
                      )
                    : Player.fromUserID(
                          userID,
                          0,
                          await isFirstGameOfDay(userID),
                          await isUserPremium(userID)
                      )
            );
        }

        this.scoreboard.setInVC(userID, inVC);
    }

    /**
     * Add all players in VC that aren't tracked to the scoreboard, and update those who left
     */
    async syncAllVoiceMembers(): Promise<void> {
        const currentVoiceMembers = getCurrentVoiceMembers(
            this.voiceChannelID
        ).map((x) => x.id);

        for (const player of this.scoreboard
            .getPlayerIDs()
            .filter((x) => !currentVoiceMembers.includes(x))) {
            await this.setPlayerInVC(player, false);
        }

        if (this.gameType === GameType.TEAMS) {
            // Players join teams manually with ,join
            return;
        }

        for (const player of currentVoiceMembers.filter(
            (x) => x !== process.env.BOT_CLIENT_ID
        )) {
            const firstGameOfDay = await isFirstGameOfDay(player);
            const premium = await isUserPremium(player);
            this.scoreboard.addPlayer(
                this.gameType === GameType.ELIMINATION
                    ? EliminationPlayer.fromUserID(
                          player,
                          (this.scoreboard as EliminationScoreboard)
                              .startingLives,
                          firstGameOfDay,
                          premium
                      )
                    : Player.fromUserID(player, 0, firstGameOfDay, premium)
            );
        }
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    protected prepareRound(randomSong: QueriedSong): Round {
        const gameRound = new GameRound(randomSong);

        gameRound.setBaseExpReward(this.calculateBaseExp());
        return gameRound;
    }

    /**
     *
     * @param userID - The user ID of the user guessing
     * @param guess - The user's guess
     * @param guessModeType - The guessing mode type to evaluate the guess against
     * @param multipleChoiceMode - Whether the answer type is set to multiple choice
     * @param typosAllowed - Whether minor typos are allowed
     * @returns The number of points achieved for the guess
     */
    private checkGuess(
        userID: string,
        guess: string,
        guessModeType: GuessModeType,
        multipleChoiceMode: boolean,
        typosAllowed = false
    ): number {
        if (!this.round) return 0;
        if (multipleChoiceMode && this.round.incorrectMCGuessers.has(userID))
            return 0;

        const pointsAwarded = this.round.checkGuess(
            guess,
            guessModeType,
            typosAllowed
        );

        if (pointsAwarded) {
            this.round.userCorrect(userID, pointsAwarded);
        }

        return pointsAwarded;
    }

    /**
     * Checks whether the author of the message is eligible to guess in the
     * current game session
     * @param messageContext - The context of the message to check for guess eligibility
     * @returns whether the user's guess is eligible
     */
    private guessEligible(messageContext: MessageContext): boolean {
        const userVoiceChannel = getUserVoiceChannel(messageContext);
        // if user isn't in the same voice channel
        if (!userVoiceChannel || userVoiceChannel.id !== this.voiceChannelID) {
            return false;
        }

        // if message isn't in the active game session's text channel
        if (messageContext.textChannelID !== this.textChannelID) {
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
                    messageContext.author.id
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
        await dbContext
            .kmq("player_stats")
            .insert({
                player_id: userID,
                first_play: currentDateString,
                last_active: currentDateString,
            })
            .onConflict("player_id")
            .ignore();

        await dbContext
            .kmq("player_servers")
            .insert({
                player_id: userID,
                server_id: this.guildID,
            })
            .onConflict(["player_id", "server_id"])
            .ignore();
    }

    /**
     * Updates a user's songs guessed in the data store
     * @param userID - The player's Discord user ID
     * @param score - The player's score in the current GameSession
     */
    private static async incrementPlayerSongsGuessed(
        userID: string,
        score: number
    ): Promise<void> {
        await dbContext
            .kmq("player_stats")
            .where("player_id", "=", userID)
            .increment("songs_guessed", score)
            .update({
                last_active: new Date(),
            });
    }

    /**
     * Updates a user's games played in the data store
     * @param userID - The player's Discord user ID
     */
    private static async incrementPlayerGamesPlayed(
        userID: string
    ): Promise<void> {
        await dbContext
            .kmq("player_stats")
            .where("player_id", "=", userID)
            .increment("games_played", 1);
    }

    /**
     * @param userID - The Discord ID of the user to exp gain
     * @param expGain - The amount of EXP gained
     */
    private static async incrementPlayerExp(
        userID: string,
        expGain: number
    ): Promise<LevelUpResult> {
        const { exp: currentExp, level } = await dbContext
            .kmq("player_stats")
            .select(["exp", "level"])
            .where("player_id", "=", userID)
            .first();

        const newExp = currentExp + expGain;
        let newLevel = level;

        // check for level up
        while (newExp > CUM_EXP_TABLE[newLevel + 1]) {
            newLevel++;
        }

        // persist exp and level to data store
        await dbContext
            .kmq("player_stats")
            .update({ exp: newExp, level: newLevel })
            .where("player_id", "=", userID);

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
     * @param score - The score gained in the game
     * @param expGain - The EXP gained in the game
     * @param levelsGained - The levels gained in the game
     */
    private static async insertPerSessionStats(
        userID: string,
        score: number,
        expGain: number,
        levelsGained: number
    ): Promise<void> {
        await dbContext.kmq("player_game_session_stats").insert({
            player_id: userID,
            date: new Date(),
            songs_guessed: score,
            exp_gained: expGain,
            levels_gained: levelsGained,
        });
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
        timePlayed: number
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
        for (const vlink of Object.keys(this.songStats)) {
            await dbContext
                .kmq("song_metadata")
                .insert({
                    vlink,
                    correct_guesses: 0,
                    rounds_played: 0,
                    skip_count: 0,
                    hint_count: 0,
                    time_to_guess_ms: 0,
                    time_played_ms: 0,
                })
                .onConflict("vlink")
                .ignore();

            await dbContext
                .kmq("song_metadata")
                .where("vlink", "=", vlink)
                .increment(
                    "correct_guesses",
                    this.songStats[vlink].correctGuesses
                )
                .increment("rounds_played", this.songStats[vlink].roundsPlayed)
                .increment("skip_count", this.songStats[vlink].skipCount)
                .increment("hint_count", this.songStats[vlink].hintCount)
                .increment(
                    "time_to_guess_ms",
                    this.songStats[vlink].timeToGuess
                )
                .increment("time_played_ms", this.songStats[vlink].timePlayed);
        }
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
        return (
            guildPreference.gameOptions.multiGuessType === MultiGuessType.ON &&
            !playerIsAlone
        );
    }

    private async updateScoreboard(
        guessResult: GuessResult,
        guildPreference: GuildPreference,
        timePlayed: number,
        messageContext: MessageContext
    ): Promise<void> {
        // update scoreboard
        const playerRoundResults = await Promise.all(
            guessResult.correctGuessers.map(async (correctGuesser, idx) => {
                const guessPosition = idx + 1;
                const expGain = await calculateTotalRoundExp(
                    guildPreference,
                    this.round,
                    getNumParticipants(this.voiceChannelID),
                    this.lastGuesser.streak,
                    timePlayed,
                    guessPosition,
                    await userBonusIsActive(correctGuesser.id),
                    correctGuesser.id
                );

                let streak = 0;
                if (idx === 0) {
                    streak = this.lastGuesser.streak;
                    logger.info(
                        `${getDebugLogHeader(messageContext)}, uid: ${
                            correctGuesser.id
                        } | Song correctly guessed. song = ${
                            this.round.song.songName
                        }. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`
                    );
                } else {
                    streak = 0;
                    logger.info(
                        `${getDebugLogHeader(messageContext)}, uid: ${
                            correctGuesser.id
                        } | Song correctly guessed ${getOrdinalNum(
                            guessPosition
                        )}. song = ${
                            this.round.song.songName
                        }. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`
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
            })
        );

        this.round.playerRoundResults = playerRoundResults;
        const scoreboardUpdatePayload: SuccessfulGuessResult[] =
            playerRoundResults.map((x) => ({
                userID: x.player.id,
                expGain: x.expGain,
                pointsEarned: x.pointsEarned,
            }));

        this.scoreboard.update(scoreboardUpdatePayload);
    }
}
