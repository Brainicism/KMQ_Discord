import { EventEmitter } from "events";

/**
 * Type-safe event emitter wrapper. Provides compile-time checking for
 * event names and payload types.
 */
// eslint-disable-next-line import/prefer-default-export
export class TypedEventEmitter<T extends Record<string, any>> {
    private emitter = new EventEmitter();

    on<K extends keyof T & string>(
        event: K,
        listener: (data: T[K]) => void,
    ): void {
        this.emitter.on(event, listener);
    }

    once<K extends keyof T & string>(
        event: K,
        listener: (data: T[K]) => void,
    ): void {
        this.emitter.once(event, listener);
    }

    emit<K extends keyof T & string>(event: K, data: T[K]): void {
        this.emitter.emit(event, data);
    }

    off<K extends keyof T & string>(
        event: K,
        listener: (data: T[K]) => void,
    ): void {
        this.emitter.off(event, listener);
    }

    removeAllListeners(): void {
        this.emitter.removeAllListeners();
    }
}
