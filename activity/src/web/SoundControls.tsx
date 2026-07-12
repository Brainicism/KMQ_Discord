import type { RoundAudio } from "./useRoundAudio";
import type { Translator } from "../i18n/translator";

/**
 * Floating sound widget for the standalone website (the embedded Activity
 * plays through Discord's voice channel and never renders this). Two states:
 * an attention-grabbing "Enable sound" pill while the browser's autoplay
 * policy is blocking playback — clicking it retries inside the user gesture —
 * and a mute toggle + volume slider otherwise.
 */
export default function SoundControls({
    audio,
    t,
}: {
    audio: RoundAudio;
    t: Translator;
}): JSX.Element {
    if (audio.needsUnlock) {
        return (
            <div className="kmq-sound-controls">
                <button
                    type="button"
                    className="kmq-sound-unlock"
                    onClick={audio.unlock}
                >
                    🔊 {t("web.sound.enable")}
                </button>
            </div>
        );
    }

    return (
        <div className="kmq-sound-controls">
            <button
                type="button"
                className="kmq-sound-mute"
                onClick={audio.toggleMuted}
                aria-label={
                    audio.muted ? t("web.sound.unmute") : t("web.sound.mute")
                }
                title={
                    audio.muted ? t("web.sound.unmute") : t("web.sound.mute")
                }
            >
                {audio.muted || audio.volume === 0 ? "🔇" : "🔊"}
            </button>
            <input
                className="kmq-sound-volume"
                type="range"
                min={0}
                max={100}
                value={audio.muted ? 0 : Math.round(audio.volume * 100)}
                onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
                aria-label={t("web.sound.volume")}
            />
        </div>
    );
}
