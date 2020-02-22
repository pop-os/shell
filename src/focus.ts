declare const imports: any;

const Me = imports.misc.extensionUtils.getCurrentExtension();

import { ShellWindow } from 'window';
import * as Geom from 'geom';
import { Ext } from './extension';

const Main = imports.ui.main;

export class FocusSelector {
    ext: Ext;

    constructor(ext: Ext) {
        this.ext = ext;
    }

    select(
        direction: (a: ShellWindow, b: Array<ShellWindow>) => Array<ShellWindow>,
        window: ShellWindow | null
    ): ShellWindow | null {
        window = window ? window : this.ext.focus_window();
        if (window) {
            let window_list = this.ext.active_window_list();
            return select(direction, window, window_list);
        }

        return null;
    }

    down(window: ShellWindow | null): ShellWindow | null {
        return this.select(window_down, window);
    }

    left(window: ShellWindow | null): ShellWindow | null {
        return this.select(window_left, window);
    }

    right(window: ShellWindow | null): ShellWindow | null {
        return this.select(window_right, window);
    }

    up(window: ShellWindow | null): ShellWindow | null {
        return this.select(window_up, window);
    }

    monitor_left(window: ShellWindow | null): ShellWindow | null {
        return this.select(window_monitor_left, window);
    }

    monitor_right(window: ShellWindow | null): ShellWindow | null {
        return this.select(window_monitor_right, window);
    }
}

function select(
    windows: (a: ShellWindow, b: Array<ShellWindow>) => Array<ShellWindow>,
    focused: ShellWindow,
    window_list: Array<ShellWindow>
) {
    return windows(focused, window_list)[0];
}

function window_down(focused: ShellWindow, windows: Array<ShellWindow>) {
    return windows
        .filter((win) => win.meta.get_frame_rect().y > focused.meta.get_frame_rect().y)
        .sort((a, b) => Geom.downward_distance(a.meta, focused.meta) - Geom.downward_distance(b.meta, focused.meta));
}

function window_left(focused: ShellWindow, windows: Array<ShellWindow>) {
    return windows
        .filter((win) => win.meta.get_frame_rect().x < focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.leftward_distance(a.meta, focused.meta) - Geom.leftward_distance(b.meta, focused.meta));
}

function window_monitor_left(focused: ShellWindow, windows: Array<ShellWindow>) {
    return windows
        .filter((win) => win.meta.get_monitor() != Main.layoutManager.focusIndex)
        .filter((win) => win.meta.get_frame_rect().x < focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.window_distance(a.meta, focused.meta) - Geom.window_distance(b.meta, focused.meta));
}

function window_monitor_right(focused: ShellWindow, windows: Array<ShellWindow>) {
    return windows
        .filter((win) => win.meta.get_monitor() != Main.layoutManager.focusIndex)
        .filter((win) => win.meta.get_frame_rect().x > focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.window_distance(a.meta, focused.meta) - Geom.window_distance(b.meta, focused.meta));
}

function window_right(focused: ShellWindow, windows: Array<ShellWindow>) {
    return windows
        .filter((win) => win.meta.get_frame_rect().x > focused.meta.get_frame_rect().x)
        .sort((a, b) => Geom.rightward_distance(a.meta, focused.meta) - Geom.rightward_distance(b.meta, focused.meta));
}

function window_up(focused: ShellWindow, windows: Array<ShellWindow>) {
    return windows
        .filter((win) => win.meta.get_frame_rect().y < focused.meta.get_frame_rect().y)
        .sort((a, b) => Geom.upward_distance(a.meta, focused.meta) - Geom.upward_distance(b.meta, focused.meta));
}
