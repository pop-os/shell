const GLib: GLib = imports.gi.GLib;
const { Clutter } = imports.gi;

export interface TweenParams {
    x: number;
    y: number;
    width: number;
    height: number;
    duration: number;
    mode: any | null;
    onComplete: () => void;
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
        || a.get_transition('width')
        || a.get_transition('height')
        || a.get_transition('scale-x')
        || a.get_transition('scale-x');
}

export function on_tween_completion(actor: Clutter.Actor, callback: () => void) {
    GLib.timeout_add(150, GLib.PRIORITY_DEFAULT, () => {
        if (is_tweening(actor)) return true;

        callback();

        return false;
    });
}