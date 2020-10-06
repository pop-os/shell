const GLib: GLib = imports.gi.GLib;
const { Clutter } = imports.gi;

export interface TweenParams {
    x: number;
    y: number;
    duration: number;
    mode: any | null;
    onComplete?: () => void;
}

export function add(a: Clutter.Actor, p: TweenParams) {
    if (!p.mode) p.mode = Clutter.AnimationMode.LINEAR;

    a.ease(p);
}

export function remove(a: Clutter.Actor) {
    a.remove_all_transitions();
}

export function is_tweening(a: Clutter.Actor) {
    return a.get_transition('x')
        || a.get_transition('y')
        || a.get_transition('scale-x')
        || a.get_transition('scale-x');
}

export function on_window_tweened(meta: Meta.Window, callback: () => void): SignalID {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        const actor = meta.get_compositor_private();
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
