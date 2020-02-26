const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Log from 'log';
import * as Rect from 'rectangle';

import type { Entity } from './ecs';
import type { Ext } from './extension';
import type { Rectangle } from './rectangle';

const { Gdk, Meta, Shell, St } = imports.gi;
const Util = imports.misc.util;

const MOTIF_HINTS: string = '_MOTIF_WM_HINTS';
const HIDE_FLAGS: string[] = ['0x2', '0x0', '0x2', '0x0', '0x0'];
const SHOW_FLAGS: string[] = ['0x2', '0x0', '0x1', '0x0', '0x0'];

export var window_tracker = Shell.WindowTracker.get_default();

export class ShellWindow {
    entity: Entity;
    meta: any;

    private window_app: any;

    constructor(entity: Entity, window: any, window_app: any, ext: Ext) {
        this.window_app = window_app;

        this.entity = entity;
        this.meta = window;

        if (!window.is_client_decorated()) {
            if (ext.settings.show_title()) {
                Log.info(`showing decorations`);
                this.decoration_show();
            } else {
                Log.info(`hiding decorations`);
                this.decoration_hide();
            }
        }
    }

    activate() {
        activate(this.meta);
    }

    decoration_hide() {
        set_hint(this.xid(), MOTIF_HINTS, HIDE_FLAGS);
    }

    decoration_show() {
        set_hint(this.xid(), MOTIF_HINTS, SHOW_FLAGS);
    }

    icon(ext: Ext, size: number) {
        return ext.icons.get_or(this.entity, () => {
            let icon = this.window_app.create_icon_texture(size);

            if (!icon) {
                icon = new St.Icon({
                    icon_name: 'applications-other',
                    icon_type: St.IconType.FULLCOLOR,
                    icon_size: size
                });
            }

            return icon;
        });
    }

    is_tilable(ext: Ext) {
        return ext.tilable.get_or(this.entity, () => {
            return !this.meta.is_skip_taskbar()
                && !blacklisted(this.meta.get_wm_class())
                && this.meta.window_type == Meta.WindowType.NORMAL;
        });
    }

    move(rect: Rectangle) {
        this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
        this.meta.unmaximize(Meta.MaximizeFlags.VERTICAL);
        this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

        this.meta.move_resize_frame(
            true,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
    }

    move_snap(ext: Ext, rect: Rectangle) {
        this.move(rect);
        ext.tiler.snap(ext, this);
    }

    name(ext: Ext): string {
        return ext.names.get_or(this.entity, () => "unknown");
    }

    rect(): Rectangle {
        return Rect.Rectangle.from_meta(this.meta.get_frame_rect());
    }

    swap(other: ShellWindow) {
        let ar = this.rect();
        let br = other.rect();

        this.move(br);
        other.move(ar);
        place_pointer_on(this.meta);
    }

    xid() {
        const desc = this.meta.get_description();
        const match = desc && desc.match(/0x[0-9a-f]+/);
        return match && match[0];
    }
}

const BLACKLIST: string[] = [
    'Conky',
    'Com.github.donadigo.eddy',
    'Gnome-screenshot'
];

/// Activates a window, and moves the mouse point to the center of it.
export function activate(win: any) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());
    place_pointer_on(win)
}

export function blacklisted(window_class: string): boolean {
    Log.debug(`window class: ${window_class}`);
    return BLACKLIST.indexOf(window_class) > -1;
}

export function place_pointer_on(win: any) {
    const rect = win.get_frame_rect();
    const x = rect.x + 8;
    const y = rect.y + 8;

    const display = Gdk.DisplayManager.get().get_default_display();

    display
        .get_default_seat()
        .get_pointer()
        .warp(display.get_default_screen(), x, y);
}

export function set_hint(xid: string, hint: string, value: string[]) {
    Util.spawn(['xprop', '-id', xid, '-f', hint, '32c', '-set', hint, value.join(', ')]);
}
