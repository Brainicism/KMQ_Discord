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
    readLocale,
    roomCodeFromLocation,
    roomPath,
    validateSession,
} from "../platform/webPlatform";
import { fetchI18nBundle } from "../api";
import { makeTranslator } from "../i18n/translator";
import App from "../App";
import RoomBar from "./RoomBar";
import kmqLogoUrl from "../assets/kmq_logo.png";
import type { Translator } from "../i18n/translator";
import type {
    PublicRoomSummaryView,
    WebRoomView,
    WebRoomVisibility,
    WebSession,
} from "../platform/webPlatform";

type LandingState =
    | { phase: "loading" }
    // `error` is an error *code* (see roomErrorText); translated at render so
    // it survives the async i18n-bundle load without a stale-string race.
    | { phase: "loggedOut"; error: string | null }
    | { phase: "loggedIn"; session: WebSession; error: string | null }
    | { phase: "inRoom"; session: WebSession; room: WebRoomView };

const PUBLIC_ROOMS_POLL_MS = 8_000;

/** Maps an error code (room results + a few web-shell states) to a message. */
function roomErrorText(t: Translator, error: string): string {
    switch (error) {
        case "not_found":
            return t("web.error.notFound");
        case "full":
            return t("web.error.full");
        case "guest_limit":
            return t("web.error.guestLimit");
        case "wrong_password":
            return t("web.error.wrongPassword");
        case "unauthorized":
            return t("web.error.unauthorized");
        case "removed":
            return t("web.error.removed");
        case "login_failed":
            return t("web.error.loginFailed");
        case "guest_unavailable":
            return t("web.error.guestUnavailable");
        default:
            return t("web.error.generic");
    }
}

/** The browse-a-public-lobby list shown to logged-in users not yet in a room. */
function PublicRoomList({
    rooms,
    busy,
    onJoin,
    t,
}: {
    rooms: PublicRoomSummaryView[] | null;
    busy: boolean;
    onJoin: (room: PublicRoomSummaryView) => void;
    t: Translator;
}): JSX.Element | null {
    // null = not loaded yet / unavailable; render nothing so the lobby doesn't
    // flash an empty state on every poll blip.
    if (rooms === null) return null;

    return (
        <div className="kmq-web-landing-lobby">
            <p className="kmq-web-landing-lobby-title">
                {t("web.lobby.title")}
            </p>
            {rooms.length === 0 ? (
                <p className="kmq-web-landing-note">{t("web.lobby.empty")}</p>
            ) : (
                <ul className="kmq-web-landing-lobby-list">
                    {rooms.map((room) => (
                        <li
                            key={room.code}
                            className="kmq-web-landing-lobby-row"
                        >
                            <span className="kmq-web-landing-lobby-name">
                                {t("web.lobby.roomName", {
                                    owner: room.ownerUsername,
                                })}
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
                                {t("web.join")}
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
    // A locked room awaiting a password entry. `showError` is set once a wrong
    // password has actually been tried (the first prompt is just a request).
    const [pendingJoin, setPendingJoin] = useState<{
        code: string;
        showError: boolean;
    } | null>(null);
    const [joinPassword, setJoinPassword] = useState("");
    // Server-resolved i18n bundle → translator. Null until loaded; the shell
    // renders a bare logo screen in the meantime.
    const [translator, setTranslator] = useState<Translator | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchI18nBundle(readLocale() ?? "en")
            .then((bundle) => {
                if (!cancelled) {
                    setTranslator(() => makeTranslator(bundle.strings));
                }
            })
            .catch(() => {
                // Fall back to a key-returning translator so the UI still
                // functions (buttons work; labels degrade to keys).
                if (!cancelled) setTranslator(() => makeTranslator({}));
            });

        return () => {
            cancelled = true;
        };
    }, []);

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
                    setPendingJoin({ code: inviteCode, showError: false });
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
                    error: inviteCode ? result.error : null,
                });
            } catch (e) {
                console.warn("Web bootstrap failed", e);
                if (!cancelled) {
                    setState({ phase: "loggedOut", error: "login_failed" });
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
                setPendingJoin({ code, showError: !!password });
                setState((prev) =>
                    prev.phase === "inRoom"
                        ? prev
                        : { phase: "loggedIn", session, error: null },
                );
                return;
            }

            setPendingJoin(null);
            setState({ phase: "loggedIn", session, error: result.error });
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
                    error: result.error,
                });
            }
        } finally {
            setBusy(false);
        }
    };

    const handleJoin = async (session: WebSession): Promise<void> => {
        // Accept a pasted invite URL or a bare code. Codes are uppercase-only,
        // so normalize typed input — a hand-entered lowercase code still joins.
        const raw = joinCode.trim();
        const fromUrl = /\/play\/r\/([^/\s?#]+)/.exec(raw);
        const code = (
            fromUrl ? decodeURIComponent(fromUrl[1]!) : raw
        ).toUpperCase();
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
                    error: "guest_unavailable",
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

    // Hold the interactive UI until the translation bundle is ready so labels
    // never flash as raw keys. Brand name (KMQ) needs no translation.
    if (!translator) {
        return (
            <div className="kmq-web-landing">
                <img
                    className="kmq-web-landing-logo"
                    src={kmqLogoUrl}
                    alt="KMQ"
                />
                <h1 className="kmq-web-landing-title">KMQ</h1>
            </div>
        );
    }

    const t = translator;

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
                    onEvicted={() => exitRoom(state.session, "removed")}
                    t={t}
                />
            </>
        );
    }

    return (
        <div className="kmq-web-landing">
            <img className="kmq-web-landing-logo" src={kmqLogoUrl} alt="KMQ" />
            <h1 className="kmq-web-landing-title">KMQ</h1>
            <p className="kmq-web-landing-tagline">{t("web.tagline")}</p>

            {state.phase === "loading" && (
                <p className="kmq-web-landing-status">{t("web.loading")}</p>
            )}

            {state.phase === "loggedOut" && (
                <>
                    {state.error && (
                        <p className="kmq-web-landing-error">
                            {roomErrorText(t, state.error)}
                        </p>
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
                        {t("web.loginDiscord")}
                    </button>

                    <p className="kmq-web-landing-divider">{t("web.or")}</p>

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
                            placeholder={t("web.nicknamePlaceholder")}
                            aria-label={t("web.nicknameLabel")}
                        />
                        <button
                            type="submit"
                            className="kmq-web-landing-button kmq-web-landing-button-secondary"
                            disabled={busy}
                        >
                            {roomCodeFromLocation()
                                ? t("web.joinAsGuest")
                                : t("web.playAsGuest")}
                        </button>
                    </form>
                    <p className="kmq-web-landing-note">{t("web.guestNote")}</p>
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
                            ? `${t("web.playingAsGuest")} `
                            : `${t("web.loggedInAs")} `}
                        <strong>{state.session.user.username}</strong>
                    </p>

                    {state.error && (
                        <p className="kmq-web-landing-error">
                            {roomErrorText(t, state.error)}
                        </p>
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
                                {t("web.passwordRequired")}
                            </p>
                            {pendingJoin.showError && (
                                <p className="kmq-web-landing-error">
                                    {t("web.error.wrongPassword")}
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
                                placeholder={t("web.passwordPlaceholder")}
                                aria-label={t("web.passwordLabel")}
                            />
                            <button
                                type="submit"
                                className="kmq-web-landing-button"
                                disabled={busy || !joinPassword}
                            >
                                {t("web.join")}
                            </button>
                            <button
                                type="button"
                                className="kmq-web-landing-button kmq-web-landing-button-secondary"
                                onClick={() => {
                                    setPendingJoin(null);
                                    setJoinPassword("");
                                }}
                            >
                                {t("web.cancel")}
                            </button>
                        </form>
                    ) : (
                        <>
                            {state.session.user.guest ? (
                                <p className="kmq-web-landing-note">
                                    {t("web.guestNoteLoggedIn")}
                                </p>
                            ) : (
                                <div className="kmq-web-landing-create">
                                    <div
                                        className="kmq-web-landing-visibility"
                                        role="group"
                                        aria-label={t("web.visibilityLabel")}
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
                                            {t("web.visibilityPublic")}
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
                                            {t("web.visibilityPrivate")}
                                        </button>
                                    </div>
                                    <p className="kmq-web-landing-hint">
                                        {visibility === "public"
                                            ? t("web.visibilityPublicHint")
                                            : t("web.visibilityPrivateHint")}
                                    </p>
                                    <input
                                        className="kmq-web-landing-input"
                                        type="password"
                                        value={createPassword}
                                        maxLength={128}
                                        onChange={(e) =>
                                            setCreatePassword(e.target.value)
                                        }
                                        placeholder={t(
                                            "web.passwordOptionalPlaceholder",
                                        )}
                                        aria-label={t(
                                            "web.passwordOptionalLabel",
                                        )}
                                    />
                                    <button
                                        type="button"
                                        className="kmq-web-landing-button"
                                        disabled={busy}
                                        onClick={() =>
                                            void handleCreate(state.session)
                                        }
                                    >
                                        {t("web.createRoom")}
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
                                    placeholder={t("web.inviteCodePlaceholder")}
                                    aria-label={t("web.inviteCodePlaceholder")}
                                />
                                <button
                                    type="submit"
                                    className="kmq-web-landing-button kmq-web-landing-button-secondary"
                                    disabled={busy || !joinCode.trim()}
                                >
                                    {t("web.join")}
                                </button>
                            </form>

                            <PublicRoomList
                                rooms={publicRooms}
                                busy={busy}
                                onJoin={(room) => {
                                    if (room.hasPassword) {
                                        setPendingJoin({
                                            code: room.code,
                                            showError: false,
                                        });
                                    } else {
                                        void attemptJoin(
                                            state.session,
                                            room.code,
                                        );
                                    }
                                }}
                                t={t}
                            />
                        </>
                    )}

                    <button
                        type="button"
                        className="kmq-web-landing-button kmq-web-landing-button-secondary"
                        onClick={() => void handleLogout()}
                    >
                        {t("web.logout")}
                    </button>
                </div>
            )}
        </div>
    );
}
