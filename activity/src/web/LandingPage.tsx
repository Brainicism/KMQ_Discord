import { useEffect, useState } from "react";
import {
    beginLogin,
    completeLoginFromUrl,
    getStoredSession,
    logout,
    validateSession,
} from "../platform/webPlatform";
import kmqLogoUrl from "../assets/kmq_logo.png";
import type { WebSession } from "../platform/webPlatform";

type LandingState =
    | { phase: "loading" }
    | { phase: "loggedOut"; error: string | null }
    | { phase: "loggedIn"; session: WebSession };

/**
 * Standalone-website entry view (Phase 1: login only). Resolves the session
 * from the OAuth callback's one-time login code or from storage, and shows
 * a login/logout surface. Room creation/joining mounts here in a later
 * phase.
 */
export default function LandingPage(): JSX.Element {
    const [state, setState] = useState<LandingState>({ phase: "loading" });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const fromUrl = await completeLoginFromUrl();
                if (cancelled) return;
                if (fromUrl) {
                    setState({ phase: "loggedIn", session: fromUrl });
                    return;
                }

                const stored = getStoredSession();
                if (!stored) {
                    setState({ phase: "loggedOut", error: null });
                    return;
                }

                const validated = await validateSession(stored);
                if (cancelled) return;
                setState(
                    validated
                        ? { phase: "loggedIn", session: validated }
                        : { phase: "loggedOut", error: null },
                );
            } catch (e) {
                console.warn("Web login bootstrap failed", e);
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

    const handleLogout = async (): Promise<void> => {
        const session =
            state.phase === "loggedIn" ? state.session : getStoredSession();

        setState({ phase: "loggedOut", error: null });
        await logout(session);
    };

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
                        onClick={beginLogin}
                    >
                        Log in with Discord
                    </button>
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
                        Logged in as{" "}
                        <strong>{state.session.user.username}</strong>
                    </p>
                    <p className="kmq-web-landing-tagline">
                        Game rooms are coming soon.
                    </p>
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
