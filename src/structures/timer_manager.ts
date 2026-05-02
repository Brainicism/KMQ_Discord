/**
 * Manages named timers and intervals with automatic cleanup.
 * All timers are cleaned up when clearAll() is called on session end.
 */
// eslint-disable-next-line import/prefer-default-export
export class TimerManager {
    private timers = new Map<string, NodeJS.Timeout>();
    private intervals = new Map<string, NodeJS.Timeout>();

    /**
     * Set a named timeout. Replaces any existing timer with the same name.
     * @param name - The timer name
     * @param callback - The callback to invoke when the timer fires
     * @param delayMs - The delay in milliseconds
     */
    set(name: string, callback: () => void, delayMs: number): void {
        this.clear(name);
        this.timers.set(
            name,
            setTimeout(() => {
                this.timers.delete(name);
                callback();
            }, delayMs),
        );
    }

    /**
     * Set a named interval. Replaces any existing interval with the same name.
     * @param name - The interval name
     * @param callback - The callback to invoke on each tick
     * @param intervalMs - The interval in milliseconds
     */
    setInterval(name: string, callback: () => void, intervalMs: number): void {
        this.clearInterval(name);
        this.intervals.set(name, global.setInterval(callback, intervalMs));
    }

    clear(name: string): void {
        const timer = this.timers.get(name);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(name);
        }
    }

    clearInterval(name: string): void {
        const interval = this.intervals.get(name);
        if (interval) {
            global.clearInterval(interval);
            this.intervals.delete(name);
        }
    }

    /** Clear ALL timers and intervals. */
    clearAll(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }

        this.timers.clear();

        for (const interval of this.intervals.values()) {
            global.clearInterval(interval);
        }

        this.intervals.clear();
    }

    has(name: string): boolean {
        return this.timers.has(name) || this.intervals.has(name);
    }
}
