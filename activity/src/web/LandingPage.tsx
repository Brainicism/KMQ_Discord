import { useEffect, useState } from "react";
import {
    beginLogin,
    completeLoginFromUrl,
    createRoom,
    fetchRoom,
    getStoredSession,
    guestLogin,
    joinRoom,
    leaveRoom,
    listPublicRooms,
    logout,
    roomCodeFromLocation,
    roomPath,
    validateSession,
} from "../platform/webPlatform";
import App from "../App";
import RoomBar from "./RoomBar";
import kmqLogoUrl from "../assets/kmq_logo.png";
import type {
    PublicRoomSummaryView,
    WebRoomView,
    WebRoomVisibility,
    WebSession,
} from "../platform/webPlatform";

type LandingState =
    | { phase: "loading" }
    | { phase: "loggedOut"; error: string | null }
    | { phase: "loggedIn"; session: WebSession; error: string | null }
    | { phase: "inRoom"; session: WebSession; room: WebRoomView };

const PUBLIC_ROOMS_POLL_MS = 8_000;

function roomErrorText(error: string): string {
    switch (error) {
        case "not_found":
            return "That room doesn't exist (or everyone left).";
        case "full":
            return "That room is full.";
        case "guest_limit":
            return "This room isn't accepting more guests. Log in with Discord to join.";
        case "wrong_password":
            return "Wrong password. Please try again.";
        case "unauthorized":
            return "Your login expired. Please log in again.";
        default:
            return "Something went wrong. Please try again.";
    }
}

/** The browse-a-public-lobby list shown to logged-in users not yet in a room. */
function PublicRoomList({
    rooms,
    busy,
    onJoin,
}: {
    rooms: PublicRoomSummaryView[] | null;
    busy: boolean;
    onJoin: (room: PublicRoomSummaryView) => void;
}): JSX.Element | null {
    // null = not loaded yet / unavailable; render nothing so the lobby doesn't
    // flash an empty state on every poll blip.
    if (rooms === null) return null;

    return (
        <div className="kmq-web-landing-lobby">
            <p className="kmq-web-landing-lobby-title">Public rooms</p>
            {rooms.length === 0 ? (
                <p className="kmq-web-landing-note">
                    No public rooms right now — create one above!
                </p>
            ) : (
                <ul className="kmq-web-landing-lobby-list">
                    {rooms.map((room) => (
                        <li
                            key={room.code}
                            className="kmq-web-landing-lobby-row"
                        >
                            <span className="kmq-web-landing-lobby-name">
                                {room.ownerUsername}&apos;s room
                                {room.hasPassword ? " 🔒" : ""}
                            </span>
                            <span className="kmq-web-landing-lobby-count">
                                {room.memberCount}/{room.maxMembers}
                            </span>
                            <button
                                type="button"
                                className="kmq-web-landing-button kmq-web-landing-button-secondary"
                                disabled={
                                    busy || room.memberCount >= room.maxMembers
                                }
                                onClick={() => onJoin(room)}
                            >
                                Join
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * Standalone-website shell. Resolves the session (OAuth login code, then
 * storage), then the room (invite URL, then server-side membership), and
 * mounts the full game <App> once inside one. The room's invite code is the
 * game's instance_id, so everything downstream of App is shared with the
 * embedded Activity untouched.
 */
export default function LandingPage(): JSX.Element {
    const [state, setState] = useState<LandingState>({ phase: "loading" });
    const [joinCode, setJoinCode] = useState("");
    const [guestName, setGuestName] = useState("");
    const [busy, setBusy] = useState(false);
    // Create-room form: visibility toggle + optional join password.
    const [visibility, setVisibility] = useState<WebRoomVisibility>("public");
    const [createPassword, setCreatePassword] = useState("");
    // Public lobby list (null = not loaded / unavailable).
    const [publicRooms, setPublicRooms] = useState<
        PublicRoomSummaryView[] | null
    >(null);
    // A locked room awaiting a password entry (set when a join needs one).
    const [pendingJoin, setPendingJoin] = useState<{
        code: string;
        error: string | null;
    } | null>(null);
    const [joinPassword, setJoinPassword] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const session =
                    (await completeLoginFromUrl()) ??
                    (getStoredSession()
                        ? await validateSession(getStoredSession()!)
                        : null);

                if (cancelled) return;
                if (!session) {
                    setState({ phase: "loggedOut", error: null });
                    return;
                }

                // An invite link takes precedence; otherwise rejoin whatever
                // room the server still counts us in (refresh/reconnect).
                const inviteCode = roomCodeFromLocation();
                const result = inviteCode
                    ? await joinRoom(session, inviteCode)
                    : await fetchRoom(session, null);

                if (cancelled) return;
                if ("room" in result) {
                    window.history.replaceState(
                        null,
                        "",
                        roomPath(result.room.code),
                    );

                    setState({ phase: "inRoom", session, room: result.room });
                    return;
                }

                // A locked invite room: keep the invite URL and prompt for the
                // password rather than bouncing to the lobby.
                if (inviteCode && result.error === "wrong_password") {
                    setPendingJoin({ code: inviteCode, error: null });
                    setState({ phase: "loggedIn", session, error: null });
                    return;
                }

                if (inviteCode) {
                    window.history.replaceState(null, "", "/play");
                }

                setState({
                    phase: "loggedIn",
                    session,
                    // Only surface an error when an invite link failed; not
                    // being in any room is the normal logged-in state.
                    error: inviteCode ? roomErrorText(result.error) : null,
                });
            } catch (e) {
                console.warn("Web bootstrap failed", e);
                if (!cancelled) {
                    setState({
                        phase: "loggedOut",
                        error: "Login failed. Please try again.",
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const enterRoom = (session: WebSession, room: WebRoomView): void => {
        window.history.pushState(null, "", roomPath(room.code));
        setState({ phase: "inRoom", session, room });
    };

    const exitRoom = (session: WebSession, error: string | null): void => {
        window.history.pushState(null, "", "/play");
        setState({ phase: "loggedIn", session, error });
    };

    const refreshPublicRooms = async (session: WebSession): Promise<void> => {
        const rooms = await listPublicRooms(session);
        setPublicRooms(rooms);
    };

    // Load the public lobby list whenever the user is logged in but not yet in
    // a room, and refresh it on an interval so it stays roughly live.
    useEffect(() => {
        if (state.phase !== "loggedIn") return undefined;
        const { session } = state;
        void refreshPublicRooms(session);
        const id = window.setInterval(
            () => void refreshPublicRooms(session),
            PUBLIC_ROOMS_POLL_MS,
        );

        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.phase]);

    /**
     * Joins a room, surfacing a password prompt when the room is locked. A
     * `wrong_password` result (whether from a missing or incorrect password)
     * parks on the pending-join prompt instead of the generic error line.
     */
    const attemptJoin = async (
        session: WebSession,
        code: string,
        password?: string,
    ): Promise<void> => {
        setBusy(true);
        try {
            const result = await joinRoom(session, code, password);
            if ("room" in result) {
                setPendingJoin(null);
                setJoinPassword("");
                setJoinCode("");
                enterRoom(session, result.room);
                return;
            }

            if (result.error === "wrong_password") {
                setPendingJoin({
                    code,
                    // Only show "wrong password" once they've actually tried
                    // one; the first prompt is just a request.
                    error: password ? roomErrorText("wrong_password") : null,
                });

                setState((prev) =>
                    prev.phase === "inRoom"
                        ? prev
                        : { phase: "loggedIn", session, error: null },
                );
                return;
            }

            setPendingJoin(null);
            setState({
                phase: "loggedIn",
                session,
                error: roomErrorText(result.error),
            });
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = async (session: WebSession): Promise<void> => {
        setBusy(true);
        try {
            const result = await createRoom(session, {
                visibility,
                password: createPassword.trim() || undefined,
            });

            if ("room" in result) {
                setCreatePassword("");
                enterRoom(session, result.room);
            } else {
                setState({
                    phase: "loggedIn",
                    session,
                    error: roomErrorText(result.error),
                });
            }
        } finally {
            setBusy(false);
        }
    };

    const handleJoin = async (session: WebSession): Promise<void> => {
        // Accept a pasted invite URL or a bare code.
        const raw = joinCode.trim();
        const fromUrl = /\/play\/r\/([^/\s?#]+)/.exec(raw);
        const code = fromUrl ? decodeURIComponent(fromUrl[1]!) : raw;
        if (!code) return;
        await attemptJoin(session, code);
    };

    const handleGuestLogin = async (): Promise<void> => {
        setBusy(true);
        try {
            const session = await guestLogin(guestName);
            if (!session) {
                setState({
                    phase: "loggedOut",
                    error: "Guest play is unavailable right now.",
                });
                return;
            }

            setState({ phase: "loggedIn", session, error: null });

            // A guest arriving on an invite link goes straight into the room
            // (or a password prompt); otherwise they land on the lobby (guests
            // can't host, but can browse + join public rooms).
            const inviteCode = roomCodeFromLocation();
            if (inviteCode) {
                await attemptJoin(session, inviteCode);
            }
        } finally {
            setBusy(false);
        }
    };

    const handleLogout = async (): Promise<void> => {
        const session =
            state.phase === "loggedIn" || state.phase === "inRoom"
                ? state.session
                : getStoredSession();

        setState({ phase: "loggedOut", error: null });
        await logout(session);
    };

    if (state.phase === "inRoom") {
        return (
            <>
                <App
                    key={state.room.code}
                    webAuth={{
                        accessToken: state.session.token,
                        instanceId: state.room.code,
                        userID: state.session.user.id,
                        guest: state.session.user.guest === true,
                    }}
                />
                <RoomBar
                    session={state.session}
                    room={state.room}
                    onLeave={() => {
                        void leaveRoom(state.session);
                        exitRoom(state.session, null);
                    }}
                    onEvicted={() =>
                        exitRoom(
                            state.session,
                            "You were removed from the room.",
                        )
                    }
                />
            </>
        );
    }

    return (
        <div className="kmq-web-landing">
            <img className="kmq-web-landing-logo" src={kmqLogoUrl} alt="KMQ" />
            <h1 className="kmq-web-landing-title">KMQ</h1>
            <p className="kmq-web-landing-tagline">
                The K-pop music guessing game
            </p>

            {state.phase === "loading" && (
                <p className="kmq-web-landing-status">Loading...</p>
            )}

            {state.phase === "loggedOut" && (
                <>
                    {state.error && (
                        <p className="kmq-web-landing-error">{state.error}</p>
                    )}
                    <button
                        type="button"
                        className="kmq-web-landing-button"
                        onClick={() =>
                            beginLogin(
                                roomCodeFromLocation()
                                    ? window.location.pathname
                                    : undefined,
                            )
                        }
                    >
                        Log in with Discord
                    </button>

                    <p className="kmq-web-landing-divider">or</p>

                    <form
                        className="kmq-web-landing-join"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleGuestLogin();
                        }}
                    >
                        <input
                            className="kmq-web-landing-input"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            maxLength={32}
                            placeholder="Pick a nickname"
                            aria-label="Guest nickname"
                        />
                        <button
                            type="submit"
                            className="kmq-web-landing-button kmq-web-landing-button-secondary"
                            disabled={busy}
                        >
                            {roomCodeFromLocation()
                                ? "Join as guest"
                                : "Play as guest"}
                        </button>
                    </form>
                    <p className="kmq-web-landing-note">
                        Guests can join rooms with an invite. Log in with
                        Discord to host your own and keep your stats.
                    </p>
                </>
            )}

            {state.phase === "loggedIn" && (
                <div className="kmq-web-landing-account">
                    {state.session.user.avatarUrl && (
                        <img
                            className="kmq-web-landing-avatar"
                            src={state.session.user.avatarUrl}
                            alt=""
                        />
                    )}
                    <p className="kmq-web-landing-status">
                        {state.session.user.guest
                            ? "Playing as guest "
                            : "Logged in as "}
                        <strong>{state.session.user.username}</strong>
                    </p>

                    {state.error && (
                        <p className="kmq-web-landing-error">{state.error}</p>
                    )}

                    {pendingJoin ? (
                        <form
                            className="kmq-web-landing-join kmq-web-landing-password"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void attemptJoin(
                                    state.session,
                                    pendingJoin.code,
                                    joinPassword,
                                );
                            }}
                        >
                            <p className="kmq-web-landing-note">
                                This room requires a password.
                            </p>
                            {pendingJoin.error && (
                                <p className="kmq-web-landing-error">
                                    {pendingJoin.error}
                                </p>
                            )}
                            <input
                                className="kmq-web-landing-input"
                                type="password"
                                value={joinPassword}
                                // eslint-disable-next-line jsx-a11y/no-autofocus
                                autoFocus
                                onChange={(e) =>
                                    setJoinPassword(e.target.value)
                                }
                                placeholder="Password"
                                aria-label="Room password"
                            />
                            <button
                                type="submit"
                                className="kmq-web-landing-button"
                                disabled={busy || !joinPassword}
                            >
                                Join
                            </button>
                            <button
                                type="button"
                                className="kmq-web-landing-button kmq-web-landing-button-secondary"
                                onClick={() => {
                                    setPendingJoin(null);
                                    setJoinPassword("");
                                }}
                            >
                                Cancel
                            </button>
                        </form>
                    ) : (
                        <>
                            {state.session.user.guest ? (
                                <p className="kmq-web-landing-note">
                                    You&apos;re playing as a guest — browse a
                                    public room below or join with an invite
                                    code. Log in with Discord to host your own
                                    and keep your stats.
                                </p>
                            ) : (
                                <div className="kmq-web-landing-create">
                                    <div
                                        className="kmq-web-landing-visibility"
                                        role="group"
                                        aria-label="Room visibility"
                                    >
                                        <button
                                            type="button"
                                            className="kmq-web-landing-toggle"
                                            data-active={
                                                visibility === "public"
                                            }
                                            onClick={() =>
                                                setVisibility("public")
                                            }
                                        >
                                            Public
                                        </button>
                                        <button
                                            type="button"
                                            className="kmq-web-landing-toggle"
                                            data-active={
                                                visibility === "private"
                                            }
                                            onClick={() =>
                                                setVisibility("private")
                                            }
                                        >
                                            Private
                                        </button>
                                    </div>
                                    <p className="kmq-web-landing-hint">
                                        {visibility === "public"
                                            ? "Anyone can find this room in the lobby list."
                                            : "Only people with the invite link can join."}
                                    </p>
                                    <input
                                        className="kmq-web-landing-input"
                                        type="password"
                                        value={createPassword}
                                        maxLength={128}
                                        onChange={(e) =>
                                            setCreatePassword(e.target.value)
                                        }
                                        placeholder="Password (optional)"
                                        aria-label="Room password (optional)"
                                    />
                                    <button
                                        type="button"
                                        className="kmq-web-landing-button"
                                        disabled={busy}
                                        onClick={() =>
                                            void handleCreate(state.session)
                                        }
                                    >
                                        Create a room
                                    </button>
                                </div>
                            )}

                            <form
                                className="kmq-web-landing-join"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void handleJoin(state.session);
                                }}
                            >
                                <input
                                    className="kmq-web-landing-input"
                                    value={joinCode}
                                    onChange={(e) =>
                                        setJoinCode(e.target.value)
                                    }
                                    placeholder="Invite code or link"
                                    aria-label="Invite code or link"
                                />
                                <button
                                    type="submit"
                                    className="kmq-web-landing-button kmq-web-landing-button-secondary"
                                    disabled={busy || !joinCode.trim()}
                                >
                                    Join
                                </button>
                            </form>

                            <PublicRoomList
                                rooms={publicRooms}
                                busy={busy}
                                onJoin={(room) => {
                                    if (room.hasPassword) {
                                        setPendingJoin({
                                            code: room.code,
                                            error: null,
                                        });
                                    } else {
                                        void attemptJoin(
                                            state.session,
                                            room.code,
                                        );
                                    }
                                }}
                            />
                        </>
                    )}

                    <button
                        type="button"
                        className="kmq-web-landing-button kmq-web-landing-button-secondary"
                        onClick={() => void handleLogout()}
                    >
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
}
