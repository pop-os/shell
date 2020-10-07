import { ShellWindow } from "./window";

const GLib: GLib = imports.gi.GLib;
const { Clutter } = imports.gi;

export interface TweenParams {
    x: number;
    y: number;
    duration: number;
    mode: any | null;
    onComplete?: () => void;
}

export function add(win: ShellWindow, p: TweenParams) {
    let a = win.meta.get_compositor_private();
    if (!p.mode) p.mode = Clutter.AnimationMode.LINEAR;
    if (a) {
        win.hide_border();
        win.update_border_layout();
        a.ease(p);
    }
}

export function remove(a: Clutter.Actor) {
    a.remove_all_transitions();
}

export function is_tweening(a: Clutter.Actor) {
    return a.get_transition('x')
        || a.get_transition('y')
        || a.get_transition('scale-x')
        || a.get_transition('scale-y');
}

export function on_window_tweened(win: ShellWindow, callback: () => void): SignalID {
    win.update_border_layout();
    win.hide_border();
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        const actor = win.meta.get_compositor_private();
        if (actor && is_tweening(actor)) return true;
        callback();
        return false;
    });
}

export function on_actor_tweened(actor: Clutter.Actor, callback: () => void): SignalID {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        if (is_tweening(actor)) return true;
        callback();
        return false;
    });
}
