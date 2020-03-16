// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as lib from 'lib';
import * as log from 'log';
import * as once_cell from 'once_cell';
import * as Rect from 'rectangle';
import * as Tags from 'tags';
import * as xprop from 'xprop';

import type { Entity } from './ecs';
import type { Ext } from './extension';
import type { Rectangle } from './rectangle';

const { Gdk, Meta, Shell, St } = imports.gi;

const { OnceCell } = once_cell;

export var window_tracker = Shell.WindowTracker.get_default();

interface X11Info {
    normal_hints: once_cell.OnceCell<lib.SizeHint | null>;
    wm_role_: once_cell.OnceCell<string | null>;
    xid_: once_cell.OnceCell<string | null>;
}

export class ShellWindow {
    entity: Entity;
    meta: Meta.Window;

    private window_app: any;
    private extra: X11Info = {
        normal_hints: new OnceCell(),
        wm_role_: new OnceCell(),
        xid_: new OnceCell()
    };

    constructor(entity: Entity, window: Meta.Window, window_app: any, ext: Ext) {
        this.window_app = window_app;

        this.entity = entity;
        this.meta = window;

        if (this.may_decorate()) {
            if (!window.is_client_decorated()) {
                if (ext.settings.show_title()) {
                    log.info(`showing decorations`);
                    this.decoration_show(ext);
                } else {
                    log.info(`hiding decorations`);
                    this.decoration_hide(ext);
                }
            }
        }
    }

    activate(): void {
        activate(this.meta);
    }

    actor_exists(): boolean {
        return this.meta.get_compositor_private() !== null;
    }

    private decoration(ext: Ext, callback: (xid: string) => void): void {
        if (this.may_decorate()) {
            const name = this.name(ext);
            const xid = this.xid();

            if (xid) {
                log.debug(`previous motif for ${name}: ${xprop.motif_hints(xid)}`);

                callback(xid);

                log.debug(`new motif for ${name}: ${xprop.motif_hints(xid)}`)
            }
        }
    }

    decoration_hide(ext: Ext): void {
        this.decoration(ext, (xid) => xprop.set_hint(xid, xprop.MOTIF_HINTS, xprop.HIDE_FLAGS));
    }

    decoration_show(ext: Ext): void {
        this.decoration(ext, (xid) => xprop.set_hint(xid, xprop.MOTIF_HINTS, xprop.SHOW_FLAGS));
    }

    icon(ext: Ext, size: number): any {
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

    may_decorate(): boolean {
        const xid = this.xid();
        return xid ? xprop.may_decorate(xid) : false;
    }

    is_maximized(): boolean {
        return this.meta.get_maximized() == Meta.MaximizeFlags.BOTH;
    }

    is_tilable(ext: Ext): boolean {
        return !ext.contains_tag(this.entity, Tags.Floating)
            && ext.tilable.get_or(this.entity, () => {
                return !this.meta.is_skip_taskbar()
                    // Only normal windows will be considered for tiling
                    && this.meta.window_type == Meta.WindowType.NORMAL
                    // Transient windows are most likely dialogs
                    && this.meta.get_transient_for() === null
                    // Blacklist any windows that happen to leak through our filter
                    && !blacklisted(this.meta.get_wm_class());
            });
    }

    move(rect: Rectangular) {
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

    name(ext: Ext): string {
        return ext.names.get_or(this.entity, () => "unknown");
    }

    rect(): Rectangle {
        return Rect.Rectangle.from_meta(this.meta.get_frame_rect());
    }

    size_hint(): lib.SizeHint | null {
        return this.extra.normal_hints.get_or_init(() => {
            const xid = this.xid();
            return xid ? xprop.get_size_hints(xid) : null;
        });
    }

    swap(other: ShellWindow): void {
        let ar = this.rect();
        let br = other.rect();

        this.move(br);
        other.move(ar);

        place_pointer_on(this.meta);
    }

    wm_role(): string | null {
        return this.extra.wm_role_.get_or_init(() => {
            const xid = this.xid();
            return xid ? xprop.get_window_role(xid) : null
        });
    }

    workspace_id(): number {
        const workspace = this.meta.get_workspace();
        if (workspace) {
            return workspace.index();
        } else {
            this.meta.change_workspace_by_index(0, false);
            return 0;
        }
    }

    xid(): string | null {
        return this.extra.xid_.get_or_init(() => xprop.get_xid(this.meta));
    }
}

const BLACKLIST: string[] = [
    'Conky',
    'Com.github.donadigo.eddy',
    'Gnome-screenshot'
];

/// Activates a window, and moves the mouse point to the center of it.
export function activate(win: Meta.Window) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());
    place_pointer_on(win)
}

export function blacklisted(window_class: string): boolean {
    log.debug(`window class: ${window_class}`);
    return BLACKLIST.indexOf(window_class) > -1;
}

export function place_pointer_on(win: Meta.Window) {
    const rect = win.get_frame_rect();
    const x = rect.x + 8;
    const y = rect.y + 8;

    const display = Gdk.DisplayManager.get().get_default_display();

    display
        .get_default_seat()
        .get_pointer()
        .warp(display.get_default_screen(), x, y);
}
