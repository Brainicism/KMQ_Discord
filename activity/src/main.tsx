import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, readInitialTheme } from "./theme";
import { isEmbedded } from "./platform";
import App from "./App";
import LandingPage from "./web/LandingPage";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
    throw new Error("Missing #root element");
}

// Stamp the theme before anything renders. App re-applies it on toggle, but
// the web landing page mounts without App — without this it would sit on the
// default (light) palette until the first game.
applyTheme(readInitialTheme());

// Same bundle, two targets: inside Discord's iframe the full Activity mounts
// as before; on the standalone website the web shell mounts instead (login
// only for now — rooms and the full game arrive in later phases).
createRoot(rootEl).render(
    <StrictMode>{isEmbedded() ? <App /> : <LandingPage />}</StrictMode>,
);
