// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Geom from 'geom';

import type { ShellWindow } from 'window';
import type { Ext } from './extension';

export class FocusSelector {
    select(
        ext: Ext,
        direction: (a: ShellWindow, b: Array<ShellWindow>) => Array<ShellWindow>,
        window: ShellWindow | null
    ): ShellWindow | null {
        window = window ?? ext.focus_window();
        if (window) {
            let window_list = ext.active_window_list();
            return select(direction, window, window_list);
        }

        return null;
    }

    down(ext: Ext, window: ShellWindow | null): ShellWindow | null {
        return this.select(ext, window_down, window);
    }

    left(ext: Ext, window: ShellWindow | null): ShellWindow | null {
        return this.select(ext, window_left, window);
    }

    right(ext: Ext, window: ShellWindow | null): ShellWindow | null {
        return this.select(ext, window_right, window);
    }

    up(ext: Ext, window: ShellWindow | null): ShellWindow | null {
        return this.select(ext, window_up, window);
    }
}

function select(
    windows: (a: ShellWindow, b: Array<ShellWindow>) => Array<ShellWindow>,
    focused: ShellWindow,
    window_list: Array<ShellWindow>
): ShellWindow | null {
    const array = windows(focused, window_list);
    return array.length > 0 ? array[0] : null;
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
