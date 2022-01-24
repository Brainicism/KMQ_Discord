/* eslint-disable no-return-assign */
import Eris from "eris";
import fs from "fs";
import _ from "lodash";
import * as uuid from "uuid";
import { SeekType } from "../commands/game_options/seek";
import dbContext from "../database_context";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendEndRoundMessage,
    sendInfoMessage,
    getNumParticipants,
    getUserVoiceChannel,
    sendEndGameMessage,
    getCurrentVoiceMembers,
    sendBookmarkedSongs,
    tryInteractionAcknowledge,
    tryCreateInteractionSuccessAcknowledgement,
    tryCreateInteractionErrorAcknowledgement,
    getMention,
    getGuildLocale,
} from "../helpers/discord_utils";
import {
    ensureVoiceConnection,
    getGuildPreference,
    getLocalizedArtistName,
    getLocalizedSongName,
    getMultipleChoiceOptions,
    userBonusIsActive,
} from "../helpers/game_utils";
import {
    delay,
    getOrdinalNum,
    setDifference,
    bold,
    codeLine,
    chunkArray,
    chooseRandom,
    friendlyFormattedNumber,
} from "../helpers/utils";
import { state } from "../kmq_worker";
import { IPCLogger } from "../logger";
import { QueriedSong, PlayerRoundResult, GameType } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard, { SuccessfulGuessResult } from "./scoreboard";
import EliminationScoreboard from "./elimination_scoreboard";
import TeamScoreboard from "./team_scoreboard";
import { deleteGameSession } from "../helpers/management_utils";
import { GuessModeType } from "../commands/game_options/guessmode";
import { getRankNameByLevel } from "../commands/game_commands/profile";
import EliminationPlayer from "./elimination_player";
import { KmqImages } from "../constants";
import MessageContext from "./message_context";
import KmqMember from "./kmq_member";
import { MultiGuessType } from "../commands/game_options/multiguess";
import { specialFfmpegArgs } from "../commands/game_options/special";
import { AnswerType } from "../commands/game_options/answer";
import { calculateTotalRoundExp } from "../commands/game_commands/exp";
import SongSelector from "./song_selector";

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
export const BOOKMARK_MESSAGE_SIZE = 10;

interface LevelUpResult {
    userID: string;
    startLevel: number;
    endLevel: number;
}

interface LastGuesser {
    userID: string;
    streak: number;
}

export interface GuessResult {
    correct: boolean;
    error?: boolean;
    correctGuessers?: Array<KmqMember>;
}

export default class GameSession {
    /** The GameType that the GameSession started in */
    public readonly gameType: GameType;

    /** The Scoreboard object keeping track of players and scoring */
    public readonly scoreboard: Scoreboard;

    /** The ID of text channel in which the GameSession was started in, and will be active in */
    public readonly textChannelID: string;

    /** The ID of the voice channel in which the GameSession was started in, and will be active in */
    public readonly voiceChannelID: string;

    /** The Discord Guild ID */
    public readonly guildID: string;

    /** Initially the user who started the GameSession, transferred to current VC member */
    public owner: KmqMember;

    /** Whether the GameSession is active yet */
    public sessionInitialized: boolean;

    /** The current active Eris.VoiceConnection */
    public connection: Eris.VoiceConnection;

    /** Whether the GameSession has ended or not */
    public finished: boolean;

    /** The last time of activity in epoch milliseconds, used to track inactive sessions  */
    public lastActive: number;

    /** The current GameRound */
    public gameRound: GameRound;

    /** List of active participants in the GameSession */
    public participants: Set<string>;

    /** The time the GameSession was started in epoch milliseconds */
    private readonly startedAt: number;

    /** The number of GameRounds played */
    private roundsPlayed: number;

    /** The number of songs correctly guessed */
    private correctGuesses: number;

    /** List of guess times per GameRound */
    private guessTimes: Array<number>;

    /** Timer function used to for ,timer command */
    private guessTimeoutFunc: NodeJS.Timer;

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

    /** Array of previous songs by messageID for bookmarking songs */
    private songMessageIDs: { messageID: string; song: QueriedSong }[];

    /** Mapping of user ID to bookmarked songs, uses Map since Set doesn't remove QueriedSong duplicates */
    private bookmarkedSongs: { [userID: string]: Map<string, QueriedSong> };

    private songSelector: SongSelector;

    constructor(
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember,
        gameType: GameType,
        eliminationLives?: number
    ) {
        this.gameType = gameType;
        this.guildID = guildID;
        if (this.gameType === GameType.ELIMINATION) {
            this.scoreboard = new EliminationScoreboard(eliminationLives);
        } else if (this.gameType === GameType.TEAMS) {
            this.scoreboard = new TeamScoreboard();
        } else {
            this.scoreboard = new Scoreboard();
        }

        this.lastActive = Date.now();
        this.sessionInitialized = false;
        this.startedAt = Date.now();
        this.participants = new Set();
        this.roundsPlayed = 0;
        this.correctGuesses = 0;
        this.guessTimes = [];
        this.connection = null;
        this.finished = false;
        this.voiceChannelID = voiceChannelID;
        this.textChannelID = textChannelID;
        this.gameRound = null;
        this.owner = gameSessionCreator;
        this.songStats = {};
        this.lastGuesser = null;
        this.songMessageIDs = [];
        this.bookmarkedSongs = {};
        this.songSelector = new SongSelector();
    }

    /**
     * Ends an active GameRound
     * @param guessResult - Whether the round ended via a correct guess (includes exp gain), or other (timeout, error, etc)
     * @param guildPreference - The GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async endRound(
        guessResult: GuessResult,
        guildPreference: GuildPreference,
        messageContext?: MessageContext
    ): Promise<void> {
        if (this.gameRound === null) {
            return;
        }

        const gameRound = this.gameRound;
        this.gameRound = null;

        gameRound.interactionMarkAnswers(guessResult.correctGuessers?.length);
        const timePlayed = Date.now() - gameRound.startedAt;

        let playerRoundResults: Array<PlayerRoundResult> = [];
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

            // update scoreboard
            playerRoundResults = await Promise.all(
                guessResult.correctGuessers.map(async (correctGuesser, idx) => {
                    const guessPosition = idx + 1;
                    const expGain = await calculateTotalRoundExp(
                        guildPreference,
                        gameRound,
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
                                gameRound.song.songName
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
                                gameRound.song.songName
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

            const scoreboardUpdatePayload: SuccessfulGuessResult[] =
                playerRoundResults.map((x) => ({
                    userID: x.player.id,
                    expGain: x.expGain,
                    pointsEarned: x.pointsEarned,
                }));

            await this.scoreboard.updateScoreboard(scoreboardUpdatePayload);
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

        // calculate remaining game duration if applicable
        const currGameLength = (Date.now() - this.startedAt) / 60000;
        const remainingDuration = guildPreference.isDurationSet()
            ? guildPreference.gameOptions.duration - currGameLength
            : null;

        if (messageContext) {
            const endRoundMessage = await sendEndRoundMessage(
                messageContext,
                this.scoreboard,
                gameRound,
                guildPreference.gameOptions.guessModeType,
                playerRoundResults,
                guildPreference.isMultipleChoiceMode(),
                remainingDuration,
                this.songSelector.getUniqueSongCounter(guildPreference)
            );

            // if message fails to send, no ID is returned
            if (endRoundMessage) {
                if (
                    Object.keys(this.songMessageIDs).length ===
                    BOOKMARK_MESSAGE_SIZE
                ) {
                    this.songMessageIDs.shift();
                }

                this.songMessageIDs.push({
                    messageID: endRoundMessage.id,
                    song: {
                        songName: gameRound.song.songName,
                        originalSongName: gameRound.song.originalSongName,
                        hangulSongName: gameRound.song.hangulSongName,
                        originalHangulSongName:
                            gameRound.song.originalHangulSongName,
                        artistName: gameRound.song.artistName,
                        hangulArtistName: gameRound.song.hangulArtistName,
                        youtubeLink: gameRound.song.youtubeLink,
                        publishDate: gameRound.song.publishDate,
                        views: gameRound.song.views,
                    },
                });
            }
        }

        this.incrementSongStats(
            gameRound.song.youtubeLink,
            guessResult.correct,
            gameRound.skipAchieved,
            gameRound.hintUsed,
            timePlayed
        );

        // cleanup
        this.stopGuessTimeout();

        if (this.finished) return;
        this.roundsPlayed++;
        // check if duration has been reached
        if (remainingDuration && remainingDuration < 0) {
            logger.info(`gid: ${this.guildID} | Game session duration reached`);
            this.endSession();
        } else if (this.scoreboard.gameFinished(guildPreference)) {
            this.endSession();
        }
    }

    /**
     * Ends the current GameSession
     */
    endSession = async (): Promise<void> => {
        if (this.finished) {
            return;
        }

        this.finished = true;
        deleteGameSession(this.guildID);
        await this.endRound(
            { correct: false },
            await getGuildPreference(this.guildID),
            new MessageContext(this.textChannelID, null, this.guildID)
        );
        const voiceConnection = state.client.voiceConnections.get(this.guildID);

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
                            id: x.getID(),
                            score: x.getDisplayedScore(),
                        }))
                )
            );
        }

        // leave voice channel
        if (voiceConnection && voiceConnection.channelID) {
            voiceConnection.stopPlaying();
            const voiceChannel = state.client.getChannel(
                voiceConnection.channelID
            ) as Eris.VoiceChannel;

            if (voiceChannel) {
                voiceChannel.leave();
            }
        }

        const leveledUpPlayers: Array<LevelUpResult> = [];
        // commit player stats
        for (const participant of this.participants) {
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
                    state.localizer.translate(
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
                    state.localizer.translate(
                        this.guildID,
                        "misc.andManyOthers"
                    )
                );
            }

            sendInfoMessage(new MessageContext(this.textChannelID), {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.levelUp.title"
                ),
                description: levelUpMessages.join("\n"),
                thumbnailUrl: KmqImages.THUMBS_UP,
            });
        }

        await sendEndGameMessage(this);

        // commit guild stats
        await dbContext
            .kmq("guild_preferences")
            .where("guild_id", this.guildID)
            .increment("games_played", 1);

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
            num_participants: this.participants.size,
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

        // DM bookmarked songs
        const bookmarkedSongsPlayerCount = Object.keys(
            this.bookmarkedSongs
        ).length;

        if (bookmarkedSongsPlayerCount > 0) {
            const bookmarkedSongCount = Object.values(
                this.bookmarkedSongs
            ).reduce((total, x) => total + x.size, 0);

            await sendInfoMessage(new MessageContext(this.textChannelID), {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.sendingBookmarkedSongs.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.sendingBookmarkedSongs.description",
                    {
                        songs: state.localizer.translateN(
                            this.guildID,
                            "misc.plural.song",
                            bookmarkedSongCount
                        ),
                        players: state.localizer.translateN(
                            this.guildID,
                            "misc.plural.player",
                            bookmarkedSongsPlayerCount
                        ),
                    }
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            });
            await sendBookmarkedSongs(this.guildID, this.bookmarkedSongs);

            // Store bookmarked songs
            await dbContext.kmq.transaction(async (trx) => {
                const idLinkPairs: { user_id: string; vlink: string }[] = [];
                for (const entry of Object.entries(this.bookmarkedSongs)) {
                    for (const song of entry[1]) {
                        idLinkPairs.push({ user_id: entry[0], vlink: song[0] });
                    }
                }

                await dbContext
                    .kmq("bookmarked_songs")
                    .insert(idLinkPairs)
                    .onConflict(["user_id", "vlink"])
                    .ignore()
                    .transacting(trx);
            });
        }

        logger.info(
            `gid: ${this.guildID} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`
        );
    };

    /**
     * Updates the GameSession's lastActive timestamp and it's value in the data store
     */
    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await dbContext
            .kmq("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ last_active: new Date() });
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
        if (!this.gameRound) return;
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
            if (this.gameRound.finished) {
                return;
            }

            this.gameRound.finished = true;
            await delay(
                this.multiguessDelayIsActive(guildPreference)
                    ? MULTIGUESS_DELAY
                    : 0
            );
            if (!this.gameRound) return;

            // mark round as complete, so no more guesses can go through
            await this.endRound(
                {
                    correct: true,
                    correctGuessers: this.gameRound.correctGuessers,
                },
                guildPreference,
                messageContext
            );
            this.correctGuesses++;

            // update game session's lastActive
            this.lastActiveNow();

            this.stopGuessTimeout();

            // increment guild's song guess count
            await dbContext
                .kmq("guild_preferences")
                .where("guild_id", this.guildID)
                .increment("songs_guessed", 1);

            this.startRound(guildPreference, messageContext);
        } else if (guildPreference.isMultipleChoiceMode()) {
            if (!this.gameRound) return;
            if (
                setDifference(
                    [
                        ...new Set(
                            getCurrentVoiceMembers(this.voiceChannelID).map(
                                (x) => x.id
                            )
                        ),
                    ],
                    [...this.gameRound.incorrectMCGuessers]
                ).size === 0
            ) {
                await this.endRound(
                    { correct: false },
                    guildPreference,
                    new MessageContext(this.textChannelID, null, this.guildID)
                );

                this.startRound(
                    await getGuildPreference(this.guildID),
                    messageContext
                );
            }
        }
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
        this.sessionInitialized = true;
        await delay(
            this.multiguessDelayIsActive(guildPreference)
                ? 3000 - MULTIGUESS_DELAY
                : 3000
        );
        if (this.finished || this.gameRound) {
            return;
        }

        if (this.songSelector.getSongs() === null) {
            try {
                await this.reloadSongs(guildPreference);
            } catch (err) {
                await sendErrorMessage(messageContext, {
                    title: state.localizer.translate(
                        this.guildID,
                        "misc.failure.errorSelectingSong.title"
                    ),
                    description: state.localizer.translate(
                        this.guildID,
                        "misc.failure.errorSelectingSong.description"
                    ),
                });

                logger.error(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(
                        guildPreference
                    )}`
                );
                await this.endSession();
                return;
            }
        }

        if (this.songSelector.checkUniqueSongQueue(guildPreference)) {
            const totalSongCount = this.songSelector.getCurrentSongCount();
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Resetting uniqueSongsPlayed (all ${totalSongCount} unique songs played)`
            );

            await sendInfoMessage(messageContext, {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.uniqueSongsReset.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.uniqueSongsReset.description",
                    { totalSongCount: friendlyFormattedNumber(totalSongCount) }
                ),
                thumbnailUrl: KmqImages.LISTENING,
            });
        }

        this.songSelector.checkAlternatingGender(guildPreference);
        const randomSong = await this.songSelector.queryRandomSong(
            guildPreference
        );

        if (randomSong === null) {
            sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.failure.songQuery.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.failure.songQuery.description"
                ),
            });
            await this.endSession();
            return;
        }

        // create a new round with randomly chosen song
        this.gameRound = this.prepareRound(randomSong);

        const voiceChannel = state.client.getChannel(
            this.voiceChannelID
        ) as Eris.VoiceChannel;

        if (!voiceChannel || voiceChannel.voiceMembers.size === 0) {
            await this.endSession();
            return;
        }

        // join voice channel and start round
        try {
            await ensureVoiceConnection(this);
        } catch (err) {
            await this.endSession();
            logger.error(
                `${getDebugLogHeader(
                    messageContext
                )} | Error obtaining voice connection. err = ${err.toString()}`
            );

            await sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.failure.vcJoin.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.failure.vcJoin.description"
                ),
            });
            return;
        }

        this.playSong(guildPreference, messageContext);

        if (guildPreference.isMultipleChoiceMode()) {
            const locale = getGuildLocale(this.guildID);
            const correctChoice =
                guildPreference.gameOptions.guessModeType ===
                GuessModeType.ARTIST
                    ? getLocalizedArtistName(this.gameRound.song, locale)
                    : getLocalizedSongName(this.gameRound.song, locale, false);

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
                this.gameRound.interactionIncorrectAnswerUUIDs[id] = 0;
                buttons.push({
                    type: 2,
                    style: 1,
                    label: choice.substring(0, 70),
                    custom_id: id,
                });
            }

            this.gameRound.interactionCorrectAnswerUUID = uuid.v4();
            buttons.push({
                type: 2,
                style: 1,
                label: correctChoice.substring(0, 70),
                custom_id: this.gameRound.interactionCorrectAnswerUUID,
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

            this.gameRound.interactionComponents = components;

            this.gameRound.interactionMessage = await sendInfoMessage(
                new MessageContext(this.textChannelID),
                {
                    title: state.localizer.translate(
                        this.guildID,
                        "misc.interaction.guess.title",
                        {
                            songOrArtist:
                                guildPreference.gameOptions.guessModeType ===
                                GuessModeType.ARTIST
                                    ? state.localizer.translate(
                                          this.guildID,
                                          "misc.artist"
                                      )
                                    : state.localizer.translate(
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
     * Sets a timeout for guessing in timer mode
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param guildPreference - The GuildPreference
     */
    startGuessTimeout(
        messageContext: MessageContext,
        guildPreference: GuildPreference
    ): Promise<void> {
        if (!guildPreference.isGuessTimeoutSet()) return;

        const time = guildPreference.gameOptions.guessTimeout;
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished || !this.gameRound || this.gameRound.finished)
                return;
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Song finished without being guessed, timer of: ${time} seconds.`
            );

            await this.endRound(
                { correct: false },
                guildPreference,
                new MessageContext(this.textChannelID, null, this.guildID)
            );

            this.startRound(
                await getGuildPreference(this.guildID),
                messageContext
            );
        }, time * 1000);
    }

    /**
     * Stops the timer set in timer mode
     */
    stopGuessTimeout(): void {
        clearTimeout(this.guessTimeoutFunc);
    }

    /**
     * Adds a participant for elimination mode
     * @param user - The user to add
     * @param midgame - Whether or not the user is being added mid-game
     * @returns the added elimination participant
     */
    addEliminationParticipant(
        user: KmqMember,
        midgame = false
    ): EliminationPlayer {
        this.participants.add(user.id);
        const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
        return eliminationScoreboard.addPlayer(
            user.id,
            user.tag,
            user.avatarUrl,
            midgame ? eliminationScoreboard.getLivesOfWeakestPlayer() : null
        );
    }

    getRoundsPlayed(): number {
        return this.roundsPlayed;
    }

    getCorrectGuesses(): number {
        return this.correctGuesses;
    }

    async reloadSongs(guildPreference: GuildPreference): Promise<void> {
        await this.songSelector.reloadSongs(guildPreference);
    }

    /**
     * Finds the song associated with the endRoundMessage via messageID, if it exists
     * @param messageID - The Discord message ID used to locate the song
     * @returns the queried song, or null if it doesn't exist
     */
    getSongFromMessageID(messageID: string): QueriedSong {
        if (!this.songMessageIDs.map((x) => x.messageID).includes(messageID)) {
            return null;
        }

        return this.songMessageIDs.find((x) => x.messageID === messageID).song;
    }

    /**
     * Stores a song with a user so they can receive it later
     * @param userID - The user that wants to bookmark the song
     * @param song - The song to store
     */
    addBookmarkedSong(userID: string, song: QueriedSong): void {
        if (!userID || !song) {
            return;
        }

        if (!this.bookmarkedSongs[userID]) {
            this.bookmarkedSongs[userID] = new Map();
        }

        this.bookmarkedSongs[userID].set(song.youtubeLink, song);
    }

    /** Updates owner to the first player to join the game that didn't leave VC */
    updateOwner(): Promise<void> {
        const voiceMembers = getCurrentVoiceMembers(this.voiceChannelID);
        const voiceMemberIDs = new Set(voiceMembers.map((x) => x.id));
        if (voiceMemberIDs.has(this.owner.id) || voiceMemberIDs.size === 0) {
            return;
        }

        const participantsInVC = [...this.participants].filter((p) =>
            voiceMemberIDs.has(p)
        );

        let newOwnerID: string;
        if (participantsInVC.length > 0) {
            // Pick the first participant still in VC
            newOwnerID = participantsInVC[0];
        } else {
            // The VC only contains members who haven't participated yet
            newOwnerID = chooseRandom(voiceMembers).id;
        }

        this.owner = KmqMember.fromUser(
            voiceMembers.find((x) => x.id === newOwnerID)
        );

        sendInfoMessage(new MessageContext(this.textChannelID), {
            title: state.localizer.translate(
                this.guildID,
                "misc.gameOwnerChanged.title"
            ),
            description: state.localizer.translate(
                this.guildID,
                "misc.gameOwnerChanged.description",
                {
                    newGameOwner: getMention(this.owner.id),
                    forcehintCommand: `\`${process.env.BOT_PREFIX}forcehint\``,
                    forceskipCommand: `\`${process.env.BOT_PREFIX}forceskip\``,
                }
            ),
            thumbnailUrl: KmqImages.LISTENING,
        });
    }

    async handleMultipleChoiceInteraction(
        interaction: Eris.ComponentInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        if (!this.gameRound) {
            return;
        }

        if (
            !getCurrentVoiceMembers(this.voiceChannelID)
                .map((x) => x.id)
                .includes(interaction.member.id)
        ) {
            tryInteractionAcknowledge(interaction);
            return;
        }

        if (this.gameRound.incorrectMCGuessers.has(interaction.member.id)) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                state.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.alreadyEliminated"
                )
            );
            return;
        }

        if (
            !this.gameRound.isValidInteractionGuess(interaction.data.custom_id)
        ) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                state.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.optionFromPreviousRound"
                )
            );
            return;
        }

        if (
            !this.gameRound.isCorrectInteractionAnswer(
                interaction.data.custom_id
            )
        ) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                state.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.eliminated"
                )
            );

            this.gameRound.incorrectMCGuessers.add(interaction.member.id);
            this.gameRound.interactionIncorrectAnswerUUIDs[
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

        if (!this.gameRound) return;
        this.guessSong(
            messageContext,
            guildPreference.gameOptions.guessModeType !== GuessModeType.ARTIST
                ? this.gameRound.song.songName
                : this.gameRound.song.artistName
        );
    }

    async handleBookmarkInteraction(
        interaction: Eris.CommandInteraction
    ): Promise<void> {
        const song = this.getSongFromMessageID(interaction.data.target_id);
        if (!song) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                state.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.invalidBookmark",
                    { BOOKMARK_MESSAGE_SIZE: String(BOOKMARK_MESSAGE_SIZE) }
                )
            );
            return;
        }

        tryCreateInteractionSuccessAcknowledgement(
            interaction,
            state.localizer.translate(
                this.guildID,
                "misc.interaction.bookmarked.title"
            ),
            state.localizer.translate(
                this.guildID,
                "misc.interaction.bookmarked.description",
                {
                    songName: bold(
                        getLocalizedSongName(song, getGuildLocale(this.guildID))
                    ),
                }
            )
        );
        this.addBookmarkedSong(interaction.member?.id, song);
    }

    /**
     * Prepares a new GameRound
     * @param randomSong - The queried song
     * @returns the new GameRound
     */
    private prepareRound(randomSong: QueriedSong): GameRound {
        const gameRound = new GameRound(randomSong);

        gameRound.setBaseExpReward(this.calculateBaseExp());
        return gameRound;
    }

    /**
     * Begin playing the GameRound's song in the VoiceChannel, listen on VoiceConnection events
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    private async playSong(
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const { gameRound } = this;
        if (gameRound === null) {
            return;
        }

        const songLocation = `${process.env.SONG_DOWNLOAD_DIR}/${gameRound.song.youtubeLink}.ogg`;

        let seekLocation: number;
        const seekType = guildPreference.gameOptions.seekType;
        if (seekType === SeekType.BEGINNING) {
            seekLocation = 0;
        } else {
            const songDuration = (
                await dbContext
                    .kmq("cached_song_duration")
                    .select(["duration"])
                    .where("vlink", "=", gameRound.song.youtubeLink)
                    .first()
            ).duration;

            if (seekType === SeekType.RANDOM) {
                seekLocation = songDuration * (0.6 * Math.random());
            } else if (seekType === SeekType.MIDDLE) {
                seekLocation = songDuration * (0.4 + 0.2 * Math.random());
            }
        }

        const stream = fs.createReadStream(songLocation);

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Playing song in voice connection. seek = ${seekType}. song = ${this.getDebugSongDetails()}. guess mode = ${
                guildPreference.gameOptions.guessModeType
            }`
        );
        this.connection.removeAllListeners();
        this.connection.stopPlaying();
        try {
            let inputArgs = ["-ss", seekLocation.toString()];
            let encoderArgs = [];
            const specialType = guildPreference.gameOptions.specialType;
            if (specialType) {
                const ffmpegArgs = specialFfmpegArgs[specialType](seekLocation);
                inputArgs = ffmpegArgs.inputArgs;
                encoderArgs = ffmpegArgs.encoderArgs;
            }

            this.connection.play(stream, {
                inputArgs,
                encoderArgs,
                opusPassthrough: specialType === null,
            });
        } catch (e) {
            logger.error(`Erroring playing on voice connection. err = ${e}`);
            await this.errorRestartRound(guildPreference);
            return;
        }

        this.startGuessTimeout(messageContext, guildPreference);

        // song finished without being guessed
        this.connection.once("end", async () => {
            // replace listener with no-op to catch any exceptions thrown after this event
            this.connection.removeAllListeners("end");
            this.connection.on("end", () => {});
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Song finished without being guessed.`
            );
            this.stopGuessTimeout();

            await this.endRound(
                { correct: false },
                guildPreference,
                new MessageContext(this.textChannelID, null, this.guildID)
            );

            this.startRound(
                await getGuildPreference(this.guildID),
                messageContext
            );
        });

        this.connection.once("error", async (err) => {
            // replace listener with no-op to catch any exceptions thrown after this event
            this.connection.removeAllListeners("error");
            this.connection.on("error", () => {});
            logger.error(
                `${getDebugLogHeader(
                    messageContext
                )} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails()}. err = ${err}`
            );
            this.errorRestartRound(guildPreference);
        });
    }

    /**
     * Attempt to restart game with different song
     * @param guildPreference - The GuildPreference
     */
    private async errorRestartRound(
        guildPreference: GuildPreference
    ): Promise<void> {
        const messageContext = new MessageContext(this.textChannelID);
        await this.endRound({ correct: false, error: true }, guildPreference);
        await sendErrorMessage(messageContext, {
            title: state.localizer.translate(
                this.guildID,
                "misc.failure.songPlaying.title"
            ),
            description: state.localizer.translate(
                this.guildID,
                "misc.failure.songPlaying.description"
            ),
        });
        this.roundsPlayed--;
        this.startRound(guildPreference, messageContext);
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
        if (!this.gameRound) return 0;
        if (
            multipleChoiceMode &&
            this.gameRound.incorrectMCGuessers.has(userID)
        )
            return 0;
        if (this.gameType !== GameType.ELIMINATION) {
            this.participants.add(userID);
        }

        const pointsAwarded = this.gameRound.checkGuess(
            guess,
            guessModeType,
            typosAllowed
        );

        if (pointsAwarded) {
            this.gameRound.userCorrect(userID, pointsAwarded);
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
                !this.participants.has(messageContext.author.id) ||
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
    private async incrementSongStats(
        vlink: string,
        correct: boolean,
        skipped: boolean,
        hintRequested: boolean,
        timePlayed: number
    ): Promise<void> {
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
     * @returns Debug string containing basic information about the GameRound
     */
    private getDebugSongDetails(): string {
        if (!this.gameRound) return "No active game round";
        return `${this.gameRound.song.songName}:${this.gameRound.song.artistName}:${this.gameRound.song.youtubeLink}`;
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

    private getSongCount(): { count: number; countBeforeLimit: number } {
        const selectedSongs = this.songSelector.getSongs();
        return {
            count: selectedSongs.songs.size,
            countBeforeLimit: selectedSongs.countBeforeLimit,
        };
    }
}
