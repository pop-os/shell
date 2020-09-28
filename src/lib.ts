
// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as log from 'log';
import * as rectangle from 'rectangle';

import type { Rectangle } from 'rectangle';

const { Meta, St } = imports.gi;

export interface SizeHint {
    minimum: [number, number];
    increment: [number, number];
    base: [number, number];
}

export enum Orientation {
    HORIZONTAL = 0,
    VERTICAL = 1,
}

export function nth_rev<T>(array: Array<T>, nth: number): T | null {
    return array[array.length - nth - 1];
}

export function ok<T, X>(input: T | null, func: (a: T) => X | null): X | null {
    return input ? func(input) : null;
}

export function ok_or_else<A, B>(input: A | null, ok_func: (input: A) => B, or_func: () => B): B {
    return input ? ok_func(input) : or_func();
}

export function or_else<T>(input: T | null, func: () => T | null): T | null {
    return input ? input : func();
}

export function bench<T>(name: string, callback: () => T): T {
    const start = new Date().getMilliseconds();
    const value = callback();
    const end = new Date().getMilliseconds();

    log.info(`bench ${name}: ${end - start} ms elapsed`);

    return value;
}

export function current_monitor(): Rectangle {
    return rectangle.Rectangle.from_meta(
        global.display.get_monitor_geometry(global.display.get_current_monitor()) as Rectangular
    );
}

// Fetch rectangle that represents the cursor
export function cursor_rect(): Rectangle {
    let [x, y] = global.get_pointer();
    return new rectangle.Rectangle([x, y, 1, 1]);
}

export function dbg<T>(value: T): T {
    log.debug(String(value));
    return value;
}

/// Missing from the Clutter API is an Actor children iterator
export function* get_children(actor: Clutter.Actor): IterableIterator<Clutter.Actor> {
    let nth = 0;
    let children = actor.get_n_children();

    while (nth < children) {
        const child = actor.get_child_at_index(nth);
        if (child) yield child;
        nth += 1;
    }
}

export function join<T>(iterator: IterableIterator<T>, next_func: (arg: T) => void, between_func: () => void) {
    ok(iterator.next().value, (first) => {
        next_func(first);

        for (const item of iterator) {
            between_func();
            next_func(item);
        }
    });
}

export function is_move_op(op: number): boolean {
    return [
        Meta.GrabOp.WINDOW_BASE,
        Meta.GrabOp.MOVING,
        Meta.GrabOp.KEYBOARD_MOVING
    ].indexOf(op) > -1;
}

export function orientation_as_str(value: number): string {
    return value == 0 ? "Orientation::Horizontal" : "Orientation::Vertical";
}

/// Useful in the event that you want to reuse an actor in the future
export function recursive_remove_children(actor: Clutter.Actor) {
    for (const child of get_children(actor)) {
        recursive_remove_children(child);
    }

    actor.remove_all_children();
}

export function round_increment(value: number, increment: number): number {
    return Math.round(value / increment) * increment;
}

export function round_to(n: number, digits: number): number {
    let m = Math.pow(10, digits);
    n = parseFloat((n * m).toFixed(11));
    return Math.round(n) / m;
}

export function separator(): any {
    return new St.BoxLayout({ styleClass: 'pop-shell-separator', x_expand: true });
}
