// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Ecs from 'ecs';

const GLib: GLib = imports.gi.GLib;

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
        this.#events.push(event);

        if (this.#event_loop) return;

        this.#event_loop = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            for (const event of this.#events.splice(0)) {
                system.run(event);
            }

            if (this.#events.length === 0) {
                this.#event_loop = null;
                return false;
            }

            return true;
        });
    }
}
