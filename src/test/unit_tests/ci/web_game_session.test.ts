import {
    clearWebRoomMembers,
    getWebRoomMembers,
    isWebRoomGuildID,
    setWebRoomMembers,
} from "../../../structures/web_room_state";
import { describe } from "mocha";
import GameType from "../../../enums/game_type";
import GuildPreference from "../../../structures/guild_preference";
import KmqMember from "../../../structures/kmq_member";
import MessageContext from "../../../structures/message_context";
import OstPreference from "../../../enums/option_types/ost_preference";
import ReleaseType from "../../../enums/option_types/release_type";
import SkipCommand from "../../../commands/game_commands/skip";
import State from "../../../state";
import SubunitsPreference from "../../../enums/option_types/subunit_preference";
import WebGameSession from "../../../structures/web_game_session";
import WebRoomManager from "../../../web_room_manager";
import assert from "assert";
import dbContext from "../../../database_context";
import sinon from "sinon";
import type { PlaybackSpec } from "../../../structures/session";
import type Round from "../../../structures/round";

const OWNER_ID = "111111111111111111";
const MEMBER_ID = "222222222222222222";
// A website guest: synthetic ID (bits 62+61) that doesn't exist on Discord.
const GUEST_ID = ((1n << 62n) | (1n << 61n) | 42n).toString();
const ROOM_ID = WebRoomManager.roomIDForOwner(OWNER_ID);

async function getMockGuildPreference(): Promise<GuildPreference> {
    const guildPreference = new GuildPreference(ROOM_ID);
    sinon.stub(guildPreference, "updateGuildPreferences");
    await guildPreference.setSubunitPreference(SubunitsPreference.EXCLUDE);
    await guildPreference.setLimit(0, 99999);
    await guildPreference.setOstPreference(OstPreference.INCLUDE);
    await guildPreference.setReleaseType(ReleaseType.ALL);
    return guildPreference;
}

function fakeRound(): Round {
    return {
        song: { youtubeLink: "dQw4w9WgXcQ" },
        songStartedAt: 1_000,
        finished: false,
    } as unknown as Round;
}

function playbackSpec(overrides: Partial<PlaybackSpec> = {}): PlaybackSpec {
    return {
        songLocation: "/songs/dQw4w9WgXcQ.ogg",
        seekLocation: 30,
        songDuration: 210,
        inputArgs: ["-ss", "30"],
        encoderArgs: {},
        isClipMode: false,
        specialType: null,
        ...overrides,
    };
}

describe("web game session", () => {
    const sandbox = sinon.createSandbox();
    let session: WebGameSession;

    beforeEach(async () => {
        clearWebRoomMembers(ROOM_ID);
        session = new WebGameSession(
            await getMockGuildPreference(),
            ROOM_ID,
            new KmqMember(OWNER_ID),
            GameType.CLASSIC,
        );

        setWebRoomMembers(ROOM_ID, [
            { id: OWNER_ID, username: "alice", avatarUrl: null },
            { id: MEMBER_ID, username: "bob", avatarUrl: null },
        ]);
    });

    afterEach(() => {
        sandbox.restore();
        clearWebRoomMembers(ROOM_ID);
        // Drop the session without running the full end-session flow.
        const SessionClass = Object.getPrototypeOf(
            Object.getPrototypeOf(Object.getPrototypeOf(session)),
        ).constructor;

        SessionClass.deleteSession(ROOM_ID);
    });

    describe("web room state", () => {
        it("identifies synthetic room guild IDs", () => {
            assert.strictEqual(isWebRoomGuildID(ROOM_ID), true);
            assert.strictEqual(isWebRoomGuildID(OWNER_ID), false);
            assert.strictEqual(isWebRoomGuildID("not-a-number"), false);
        });

        it("mirrors pushed membership", () => {
            assert.deepStrictEqual(
                getWebRoomMembers(ROOM_ID).map((m) => m.id),
                [OWNER_ID, MEMBER_ID],
            );

            clearWebRoomMembers(ROOM_ID);
            assert.deepStrictEqual(getWebRoomMembers(ROOM_ID), []);
        });
    });

    describe("transport overrides", () => {
        it("identifies as a web session with room participants", () => {
            assert.strictEqual(session.isWebSession(), true);
            assert.deepStrictEqual((session as any).getParticipantIDs(), [
                OWNER_ID,
                MEMBER_ID,
            ]);
        });

        it("derives vote majority from room membership", () => {
            assert.strictEqual(session.getVoteMajorityCount(), 2);

            setWebRoomMembers(ROOM_ID, [
                { id: OWNER_ID, username: "alice", avatarUrl: null },
            ]);

            assert.strictEqual(session.getVoteMajorityCount(), 1);
        });

        it("accepts guesses only from room members", () => {
            const memberContext = new MessageContext(
                "",
                new KmqMember(MEMBER_ID),
                ROOM_ID,
            );

            const strangerContext = new MessageContext(
                "",
                new KmqMember("333333333333333333"),
                ROOM_ID,
            );

            assert.strictEqual(
                (session as any).guesserInSessionChannels(memberContext),
                true,
            );

            assert.strictEqual(
                (session as any).guesserInSessionChannels(strangerContext),
                false,
            );
        });

        it("allows playback while members remain and ends the session when empty", async () => {
            const messageContext = new MessageContext(
                "",
                new KmqMember(OWNER_ID),
                ROOM_ID,
            );

            assert.strictEqual(
                await (session as any).preparePlaybackChannel(messageContext),
                true,
            );

            const endStub = sandbox
                .stub(session, "endSessionFromLifecycle" as any)
                .resolves();

            setWebRoomMembers(ROOM_ID, []);
            assert.strictEqual(
                await (session as any).preparePlaybackChannel(messageContext),
                false,
            );

            assert.strictEqual(endStub.calledOnce, true);
        });

        it("builds scoreboard players from room membership, guests included", async () => {
            // Regression: player identities used to come from Discord's API
            // (fetchUser), which 404s for guests' synthetic IDs — the guest
            // never made it onto the scoreboard, showing as a raw numeric ID
            // in the client and blowing up the correct-guess round-end flow.
            setWebRoomMembers(ROOM_ID, [
                { id: OWNER_ID, username: "alice", avatarUrl: null },
                { id: GUEST_ID, username: "Guesty", avatarUrl: null },
            ]);

            // getName consults the guild nickname cache before falling back
            // to the stored username; web rooms have no guild entry.
            sandbox.stub(State, "client").value({ guilds: new Map() });

            await session.syncAllVoiceMembers();

            const players = (session as any).scoreboard.getPlayers();
            assert.deepStrictEqual(
                players.map((p: any) => [p.id, p.getName()]).sort(),
                [
                    [OWNER_ID, "alice"],
                    [GUEST_ID, "Guesty"],
                ],
            );
        });

        it("scoreboard.update tolerates a guesser missing from the scoreboard", () => {
            // Regression: the missing-player warn log resolved the session's
            // voice channel — empty for web sessions, which made Eris throw
            // ("Invalid channel ID:") and abort the round-end mid-flight.
            (session as any).scoreboard.update([
                { userID: "333333333333333333", pointsEarned: 1, expGain: 10 },
            ]);
        });

        it("does not persist stats rows for guests", async () => {
            setWebRoomMembers(ROOM_ID, [
                { id: OWNER_ID, username: "alice", avatarUrl: null },
                { id: GUEST_ID, username: "Guesty", avatarUrl: null },
            ]);

            await session.syncAllVoiceMembers();
            await (session as any).updatePlayerStats(false);

            const rows = await dbContext.kmq
                .selectFrom("player_stats")
                .select("player_id")
                .where("player_id", "in", [OWNER_ID, GUEST_ID])
                .execute();

            // The Discord-account member persists; the guest never does.
            assert.deepStrictEqual(
                rows.map((r) => r.player_id),
                [OWNER_ID],
            );

            await Promise.all(
                (
                    [
                        "player_stats",
                        "player_servers",
                        "player_game_session_stats",
                    ] as const
                ).map((table) =>
                    dbContext.kmq
                        .deleteFrom(table)
                        .where("player_id", "=", OWNER_ID)
                        .execute(),
                ),
            );
        });

        it("counts skip votes without a voice-channel check", async () => {
            // Regression: executeSkip used to hard-require the user and bot
            // to share a VC, which silently swallowed every web skip.
            State.gameSessions[ROOM_ID] = session;
            // The non-majority path formats a (suppressed) embed that reads
            // the bot's voice connections; give it the worker's empty map.
            sandbox.stub(State, "client").value({
                voiceConnections: new Map(),
            });

            const skippers = new Set<string>();
            (session as any).round = {
                song: { youtubeLink: "dQw4w9WgXcQ" },
                songStartedAt: 1_000,
                finished: false,
                skipAchieved: false,
                userSkipped: (id: string) => skippers.add(id),
                getSkipCount: () => skippers.size,
            };

            await SkipCommand.executeSkip(
                new MessageContext("", new KmqMember(OWNER_ID), ROOM_ID),
            );

            assert.deepStrictEqual([...skippers], [OWNER_ID]);
        });
    });

    describe("playback", () => {
        it("emits roundAudio with the stream spec and duration", async () => {
            const events: any[] = [];
            session.on("roundAudio", (payload) => events.push(payload));

            await (session as any).beginPlayback(playbackSpec(), fakeRound());

            assert.strictEqual(events.length, 1);
            assert.strictEqual(events[0].youtubeLink, "dQw4w9WgXcQ");
            assert.strictEqual(events[0].seekLocation, 30);
            // No -t limit: plays out the rest of the song.
            assert.strictEqual(events[0].playbackDurationSec, 180);
            assert.strictEqual(events[0].songStartedAt, 1_000);
        });

        it("prefers the ffmpeg -t limit for the playback duration", async () => {
            const events: any[] = [];
            session.on("roundAudio", (payload) => events.push(payload));

            await (session as any).beginPlayback(
                playbackSpec({ encoderArgs: { "-t": ["12.5"] } }),
                fakeRound(),
            );

            assert.strictEqual(events[0].playbackDurationSec, 12.5);
            assert.deepStrictEqual(events[0].encoderArgs, ["-t", "12.5"]);
        });

        it("ends the round via timer after the playback duration", async () => {
            const clock = sandbox.useFakeTimers();
            const handleEnd = sandbox
                .stub(session, "handlePlaybackEnd" as any)
                .resolves();

            const messageContext = new MessageContext(
                "",
                new KmqMember(OWNER_ID),
                ROOM_ID,
            );

            const round = fakeRound();
            await (session as any).beginPlayback(
                playbackSpec({ encoderArgs: { "-t": ["10"] } }),
                round,
            );

            (session as any).armPlaybackEnd(messageContext, round, null);

            // 10s playback + 1s grace: not yet...
            await clock.tickAsync(10_500);
            assert.strictEqual(handleEnd.called, false);

            // ...now.
            await clock.tickAsync(600);
            assert.strictEqual(handleEnd.calledOnce, true);
        });

        it("stopPlayback disarms the pending round-end timer", async () => {
            const clock = sandbox.useFakeTimers();
            const handleEnd = sandbox
                .stub(session, "handlePlaybackEnd" as any)
                .resolves();

            const messageContext = new MessageContext(
                "",
                new KmqMember(OWNER_ID),
                ROOM_ID,
            );

            const round = fakeRound();
            await (session as any).beginPlayback(
                playbackSpec({ encoderArgs: { "-t": ["10"] } }),
                round,
            );

            (session as any).armPlaybackEnd(messageContext, round, null);

            // The guess/skip path starts the next round, whose playSong stops
            // the previous playback — the old timer must never fire.
            (session as any).stopPlayback();

            await clock.tickAsync(60_000);
            assert.strictEqual(handleEnd.called, false);
        });

        it("re-arming replaces the previous timer instead of stacking", async () => {
            const clock = sandbox.useFakeTimers();
            const handleEnd = sandbox
                .stub(session, "handlePlaybackEnd" as any)
                .resolves();

            const messageContext = new MessageContext(
                "",
                new KmqMember(OWNER_ID),
                ROOM_ID,
            );

            const round = fakeRound();
            await (session as any).beginPlayback(
                playbackSpec({ encoderArgs: { "-t": ["10"] } }),
                round,
            );

            (session as any).armPlaybackEnd(messageContext, round, null);
            (session as any).armPlaybackEnd(messageContext, round, null);

            await clock.tickAsync(60_000);
            assert.strictEqual(handleEnd.calledOnce, true);
        });
    });
});
