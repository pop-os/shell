const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, Gdk, Meta, Shell, St } = imports.gi;
const { Geom, Window } = Me.imports.lib;
const Main = imports.ui.main;

var FocusSelector = class FocusSelector {
    constructor(ext) {
        this.ext = ext;
    }

    select(direction) {
        let window_list = this.ext.active_window_list();
        return select(direction, this.ext.focus_window(), window_list);
    }

    down() {
        return this.select(window_down);
    }

    left() {
        return this.select(window_left);
    }

    right() {
        return this.select(window_right);
    }

    up() {
        return this.select(window_up);
    }

    monitor_left() {
        return this.select(window_monitor_left);
    }

    monitor_right() {
        return this.select(window_monitor_right);
    }
}

function select(windows, focused, window_list) {
    return windows(focused, window_list)[0];
}

function window_down(focused, windows) {
    return windows
        .filter((win) => win.meta.get_frame_rect().y > focused.meta.get_frame_rect().y)
        .sort((a, b) => Geom.downward_distance(a.meta, focused.meta) - Geom.downward_distance(b.meta, focused.meta));
}

function window_left(focused, windows) {
    return windows
        .filter((win) => win.meta.get_frame_rect().x < focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.leftward_distance(a.meta, focused.meta) - Geom.leftward_distance(b.meta, focused.meta));
}

function window_monitor_left(focused, windows) {
    return windows
        .filter((win) => win.get_monitor() != Main.layoutManager.focusIndex)
        .filter((win) => win.meta.get_frame_rect().x < focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.window_distance(a.meta, focused.meta) - Geom.window_distance(b.meta, focused.meta));
}

function window_monitor_right(focused, windows) {
    return windows
        .filter((win) => win.get_monitor() != Main.layoutManager.focusIndex)
        .filter((win) => win.meta.get_frame_rect().x > focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.window_distance(a.meta, focused.meta) - Geom.window_distance(b.meta, focused.meta));
}

function window_right(focused, windows) {
    return windows
        .filter((win) => win.meta.get_frame_rect().x > focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.rightward_distance(a.meta, focused.meta) - Geom.rightward_distance(b.meta, focused.meta));
}

function window_up(focused, windows) {
    return windows
        .filter((win) => win.meta.get_frame_rect().y < focused.meta.get_frame_rect().y)
        .sort((a, b) => Geom.upward_distance(a.meta, focused.meta) - Geom.upward_distance(b.meta, focused.meta));
}
