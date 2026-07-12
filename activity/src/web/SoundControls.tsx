import type { RoundAudio } from "./useRoundAudio";

/**
 * Floating sound widget for the standalone website (the embedded Activity
 * plays through Discord's voice channel and never renders this). Two states:
 * an attention-grabbing "Enable sound" pill while the browser's autoplay
 * policy is blocking playback — clicking it retries inside the user gesture —
 * and a mute toggle + volume slider otherwise.
 */
export default function SoundControls({
    audio,
}: {
    audio: RoundAudio;
}): JSX.Element {
    if (audio.needsUnlock) {
        return (
            <div className="kmq-sound-controls">
                <button
                    type="button"
                    className="kmq-sound-unlock"
                    onClick={audio.unlock}
                >
                    🔊 Enable sound
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
                aria-label={audio.muted ? "Unmute" : "Mute"}
                title={audio.muted ? "Unmute" : "Mute"}
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
                aria-label="Volume"
            />
        </div>
    );
}
