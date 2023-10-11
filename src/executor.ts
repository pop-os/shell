import * as Ecs from './ecs.js';
import GLib from 'gi://GLib';

export interface Executor<T> {
    wake<S extends Ecs.System<T>>(system: S, event: T): void;
}

/** Glib-based event executor */
export class GLibExecutor<T> implements Executor<T> {
    #event_loop: SignalID | null = null;
    #events: Array<T> = new Array();

    /** Creates an idle_add signal that exists only for as long as there are events to process.
     *
     * - If the signal has already been created, the event will be added to the queue.
     * - The signal will continue executing for as long as there are events remaining in the queue.
     * - Events are handled within batches, yielding between each new set of events.
     */
    wake<S extends Ecs.System<T>>(system: S, event: T): void {
        this.#events.unshift(event);

        if (this.#event_loop) return;

        this.#event_loop = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            let event = this.#events.pop();
            if (event) system.run(event);

            if (this.#events.length === 0) {
                this.#event_loop = null;
                return false;
            }

            return true;
        });
    }
}

export class OnceExecutor<X, T extends Iterable<X>> {
    #iterable: T;
    #signal: SignalID | null = null;

    constructor(iterable: T) {
        this.#iterable = iterable;
    }

    start(delay: number, apply: (v: X) => boolean, then?: () => void) {
        this.stop();

        const iterator = this.#iterable[Symbol.iterator]();

        this.#signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            const next: X = iterator.next().value;

            if (typeof next === 'undefined') {
                if (then)
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        then();
                        return false;
                    });

                return false;
            }

            return apply(next);
        });
    }

    stop() {
        if (this.#signal !== null) GLib.source_remove(this.#signal);
    }
}

export class ChannelExecutor<X> {
    #channel: Array<X> = new Array();

    #signal: null | number = null;

    clear() {
        this.#channel.splice(0);
    }

    get length(): number {
        return this.#channel.length;
    }

    send(v: X) {
        this.#channel.push(v);
    }

    start(delay: number, apply: (v: X) => boolean) {
        this.stop();

        this.#signal = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            const e = this.#channel.shift();

            return typeof e === 'undefined' ? true : apply(e);
        });
    }

    stop() {
        if (this.#signal !== null) GLib.source_remove(this.#signal);
    }
}
