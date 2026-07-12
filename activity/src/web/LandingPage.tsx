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
    logout,
    roomCodeFromLocation,
    roomPath,
    validateSession,
} from "../platform/webPlatform";
import App from "../App";
import RoomBar from "./RoomBar";
import kmqLogoUrl from "../assets/kmq_logo.png";
import type { WebRoomView, WebSession } from "../platform/webPlatform";

type LandingState =
    | { phase: "loading" }
    | { phase: "loggedOut"; error: string | null }
    | { phase: "loggedIn"; session: WebSession; error: string | null }
    | { phase: "inRoom"; session: WebSession; room: WebRoomView };

function roomErrorText(error: string): string {
    switch (error) {
        case "not_found":
            return "That room doesn't exist (or everyone left).";
        case "full":
            return "That room is full.";
        case "unauthorized":
            return "Your login expired. Please log in again.";
        default:
            return "Something went wrong. Please try again.";
    }
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

    const handleCreate = async (session: WebSession): Promise<void> => {
        setBusy(true);
        try {
            const result = await createRoom(session);
            if ("room" in result) {
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

        setBusy(true);
        try {
            const result = await joinRoom(session, code);
            if ("room" in result) {
                setJoinCode("");
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

            // A guest arriving on an invite link goes straight into the room;
            // otherwise they land on the join form (guests can't host).
            const inviteCode = roomCodeFromLocation();
            if (inviteCode) {
                const result = await joinRoom(session, inviteCode);
                if ("room" in result) {
                    enterRoom(session, result.room);
                    return;
                }

                window.history.replaceState(null, "", "/play");
                setState({
                    phase: "loggedIn",
                    session,
                    error: roomErrorText(result.error),
                });
                return;
            }

            setState({ phase: "loggedIn", session, error: null });
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

                    {state.session.user.guest ? (
                        <p className="kmq-web-landing-note">
                            You&apos;re playing as a guest — join a room with an
                            invite code. Log in with Discord to host your own
                            and keep your stats.
                        </p>
                    ) : (
                        <button
                            type="button"
                            className="kmq-web-landing-button"
                            disabled={busy}
                            onClick={() => void handleCreate(state.session)}
                        >
                            Create a room
                        </button>
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
                            onChange={(e) => setJoinCode(e.target.value)}
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
