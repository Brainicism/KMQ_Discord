import { IPCLogger } from "../logger";

const logger = new IPCLogger("timer_manager");

/**
 * Manages named timers and intervals with automatic cleanup.
 * Replaces scattered setTimeout/setInterval/clearTimeout calls
 * and ensures all timers are cleaned up when the session ends.
 */
export class TimerManager {
    private timers = new Map<string, NodeJS.Timeout>();
    private intervals = new Map<string, NodeJS.Timeout>();

    /** Set a named timeout. Replaces any existing timer with the same name. */
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

    /** Set a named interval. Replaces any existing interval with the same name. */
    setInterval(name: string, callback: () => void, intervalMs: number): void {
        this.clearInterval(name);
        this.intervals.set(name, global.setInterval(callback, intervalMs));
    }

    /** Clear a specific timeout by name. */
    clear(name: string): void {
        const timer = this.timers.get(name);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(name);
        }
    }

    /** Clear a specific interval by name. */
    clearInterval(name: string): void {
        const interval = this.intervals.get(name);
        if (interval) {
            global.clearInterval(interval);
            this.intervals.delete(name);
        }
    }

    /** Clear ALL timers and intervals. Called on session end. */
    clearAll(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }

        this.timers.clear();

        for (const interval of this.intervals.values()) {
            global.clearInterval(interval);
        }

        this.intervals.clear();

        logger.info("All timers and intervals cleared");
    }

    /** Check if a named timer or interval is active. */
    has(name: string): boolean {
        return this.timers.has(name) || this.intervals.has(name);
    }
}
