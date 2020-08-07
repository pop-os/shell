// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as lib from 'lib';
import * as log from 'log';
import * as once_cell from 'once_cell';
import * as Rect from 'rectangle';
import * as Tags from 'tags';
import * as utils from 'utils';
import * as xprop from 'xprop';
import * as Tweener from 'tweener';

import type { Entity } from './ecs';
import type { Ext } from './extension';
import type { Rectangle } from './rectangle';

// const GLib: GLib = imports.gi.GLib;
const { Gdk, GdkX11, Meta, Shell, St } = imports.gi;

const { OnceCell } = once_cell;

export var window_tracker = Shell.WindowTracker.get_default();

const GDK_DISPLAY = Gdk.DisplayManager.get().get_default_display();

const WM_TITLE_BLACKLIST: Array<string> = [
    'Firefox',
    'Nightly', // Firefox Nightly
    'Tor Browser'
];

interface X11Info {
    normal_hints: once_cell.OnceCell<lib.SizeHint | null>;
    wm_role_: once_cell.OnceCell<string | null>;
    xid_: once_cell.OnceCell<string | null>;
}

export class ShellWindow {
    entity: Entity;
    meta: Meta.Window;

    was_attached_to?: [Entity, boolean];

    private window_app: any;
    private extra: X11Info = {
        normal_hints: new OnceCell(),
        wm_role_: new OnceCell(),
        xid_: new OnceCell()
    };

    private default_win_settings = {
        min_height: 0,
        min_width: 0,
        base_height: 0,
        base_width: 0,
        height_inc: 5,
        width_inc: 5
    }

    private ext: Ext;

    constructor(entity: Entity, window: Meta.Window, window_app: any, ext: Ext) {
        this.window_app = window_app;

        this.entity = entity;
        this.meta = window;
        this.ext = ext;

        if (this.is_transient()) {
            log.info(`making above`);
            window.make_above();
        }

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

    private decoration(_ext: Ext, callback: (xid: string) => void): void {
        if (this.may_decorate()) {
            const xid = this.xid();
            if (xid) callback(xid);
        }
    }

    cmdline(): string | null {
        let pid = this.meta.get_pid();
        if (-1 === pid) return null;

        const path = '/proc/' + pid + '/cmdline';
        if (!utils.exists(path)) return null;

        const result = utils.read_to_string(path);
        if (result.kind == 1) {
            return result.value.trim();
        } else {
            log.error(`failed to fetch cmdline: ${result.value.format()}`);
            return null;
        }
    }

    decoration_hide(ext: Ext): void {
        if (this.ignore_decoration()) return;
        this.decoration(ext, (xid) => xprop.set_hint(xid, xprop.MOTIF_HINTS, xprop.HIDE_FLAGS));
    }

    decoration_show(ext: Ext): void {
        if (this.ignore_decoration()) return;
        this.decoration(ext, (xid) => xprop.set_hint(xid, xprop.MOTIF_HINTS, xprop.SHOW_FLAGS));
    }

    icon(_ext: Ext, size: number): any {
        let icon = this.window_app.create_icon_texture(size);

        if (!icon) {
            icon = new St.Icon({
                icon_name: 'applications-other',
                icon_type: St.IconType.FULLCOLOR,
                icon_size: size
            });
        }

        return icon;
    }

    ignore_decoration(): boolean {
        const name = this.meta.get_wm_class();
        if (name === null) return true;
        return WM_TITLE_BLACKLIST.findIndex((n) => name.startsWith(n)) !== -1;
    }

    may_decorate(): boolean {
        const xid = this.xid();
        return xid ? xprop.may_decorate(xid) : false;
    }

    is_maximized(): boolean {
        return this.meta.get_maximized() !== 0;
    }

    is_tilable(ext: Ext): boolean {
        return !ext.contains_tag(this.entity, Tags.Floating)
            && ext.tilable.get_or(this.entity, () => {
                let wm_class = this.meta.get_wm_class();
                return !this.meta.is_skip_taskbar()
                    // Only normal windows will be considered for tiling
                    && this.meta.window_type == Meta.WindowType.NORMAL
                    // Transient windows are most likely dialogs
                    && !this.is_transient()
                    // Blacklist any windows that happen to leak through our filter
                    && (wm_class === null || !blacklisted(wm_class, this.meta.get_title()));
            });
    }

    is_transient(): boolean {
        return this.meta.get_transient_for() !== null;
    }

    move(ext: Ext, rect: Rectangular, on_complete?: () => void) {
        const clone = Rect.Rectangle.from_meta(rect);
        const actor = this.meta.get_compositor_private();

        if (actor) {
            // apply here
            this.change_window_hints();

            this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            this.meta.unmaximize(Meta.MaximizeFlags.VERTICAL);
            this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

            const entity_string = String(this.entity);

            const onComplete = () => {
                ext.register({ tag: 2, window: this, kind: { tag: 1, rect: clone } });
                if (on_complete) ext.register_fn(on_complete);
                ext.tween_signals.delete(entity_string);
                if (ext.active_hint?.is_tracking(this.entity)) {
                    ext.active_hint.show();
                }
            };

            if (ext.animate_windows && !ext.init) {
                const current = this.meta.get_frame_rect();
                const buffer = this.meta.get_buffer_rect();

                const dx = current.x - buffer.x;
                const dy = current.y - buffer.y;

                const slot = ext.tween_signals.get(entity_string);
                if (slot !== undefined) {
                    const [signal, callback] = slot;
                    Tweener.remove(actor);
                    utils.source_remove(signal);
                    callback();
                }

                Tweener.add(actor, {
                    x: clone.x - dx,
                    y: clone.y - dy,
                    duration: 149,
                    mode: null,
                });

                if (ext.active_hint?.is_tracking(this.entity)) {
                    ext.active_hint.hide();
                }

                ext.tween_signals.set(entity_string, [
                    Tweener.on_window_tweened(this.meta, onComplete),
                    onComplete
                ]);
            } else {
                onComplete();
            }
        }
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

    swap(ext: Ext, other: ShellWindow): void {
        let ar = this.rect().clone();
        let br = other.rect().clone();

        other.move(ext, ar);
        this.move(ext, br, () => place_pointer_on(this.meta));
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
        return this.extra.xid_.get_or_init(() => {
            if (utils.is_wayland()) return null;
            return xprop.get_xid(this.meta);
        })
    }

    gdk_window(): any {
        // TODO - is this compatible with Wayland? If pop-shell ever do support
        return GdkX11.X11Window.foreign_new_for_display(GDK_DISPLAY, this.xid())
    }

    /**
     * Change the WM_HINTS and store the window original WM_NORMAL_HINTS - so can be restored later.
     * - program specified minimum W x H
     * - program specified base W x H
     * - program specified size increments W x H
     * 
     * Makes the ability to resize window during: 
     * - window edits (Super + Enter)
     * - drag-resize (on grab)
     * 
     * Scope: this method is applied on: 
     * - enable extension
     * - during move_window() - Gnome control center auto restores during child panel open - has to be re-applied during a resize event.
     * - enable toggle (Super + Y or icon)
     * - enable float - shell is also doing window edits for these.
     * - re-applied during end of drag-resize (on grab end) - fixes Gnome Terminal glitch.
     * 
     * TODO/Issues:
     * - Find a way to traverse, apply to an embedded window, e.g. Gnome terminal 2+ tabbed instances
     * - After modifying the WM_HINTS and then restarting gnome-shell, some apps crash: Electron-based, PyGobject/PyGTK-based apps
     *   - /var/log/syslog - says the window(s) are not in the tracked list, and seems no way to put them back even after restoration.
     *   - xwininfo, xprop - compare?
     * - Gnome settings when on the right-hand-size of a monitor, during child panel open, triggers re-arrange and moves to right-side monitor.
     */
    change_window_hints(): void {
        if (this.ext.settings.override_wm_hints()) {
            let gdk_window = this.gdk_window();
            let geo = new Gdk.Geometry();

            this.store_default_hints()

            let hint_mask = Gdk.WindowHints.MIN_SIZE;

            // TODO - need the active monitors, need revisit on different monitor configs
            let rect = this.ext.monitor_work_area(this.ext.active_monitor());

            // TODO - we don't want zero, negative value, but check 4K. Currently 1080p
            let least_denom = 8; // 1080p
            // let least_denom = 16; //4k?

            geo.min_width = rect.width / least_denom;
            geo.min_height = rect.height / least_denom;

            gdk_window.set_geometry_hints(geo, hint_mask);
        }
    }

    store_default_hints() {
        let def_win_set = this.default_win_settings;
        let size_hint = this.size_hint();
        let min = size_hint?.minimum;
        let base = size_hint?.base;
        let increment = size_hint?.increment;

        const WIDTH = 0, HEIGHT = 1, DEFAULT = 0;

        // store dimensions
        if (def_win_set.min_width === DEFAULT) {
            def_win_set.min_width = min ? min[WIDTH] : DEFAULT;
        }

        if (def_win_set.min_height === DEFAULT) {
            def_win_set.min_height = min ? min[HEIGHT] : DEFAULT;
        }

        // store base dimensions
        if (def_win_set.base_width === DEFAULT) {
            def_win_set.base_width = base ? base[WIDTH] : DEFAULT;
        }

        if (def_win_set.base_height === DEFAULT) {
            def_win_set.base_height = base ? base[HEIGHT] : DEFAULT;
        }

        // store size increments
        if (def_win_set.width_inc === DEFAULT) {
            def_win_set.width_inc = increment ? increment[WIDTH] : DEFAULT;
        }

        if (def_win_set.height_inc === DEFAULT) {
            def_win_set.height_inc = increment ? increment[HEIGHT] : DEFAULT;
        }
    }

    /**
     * Restore the WM_NORMAL_HINTS.
     * See - window.change_window_hints(), extension.restore_all_window_hints()
     * 
     * Scope:
     * - disable extension
     * - un-float windows
     * - disable toggle
     */
    restore_window_hints(): void {
        if (this.ext.settings.override_wm_hints()) {
            let gdk_window = this.gdk_window()
            let geo = new Gdk.Geometry()
            let def_win_set = this.default_win_settings;
            const DEFAULT = 0, DEFAULT_INC = 5;

            // restore dimensions if there is a stored original hints values
            geo.min_width = !!(def_win_set.min_width > DEFAULT) ? def_win_set.min_width : undefined;
            geo.min_height = !!(def_win_set.min_height > DEFAULT) ? def_win_set.min_height : undefined;
            geo.base_width = !!(def_win_set.base_width > DEFAULT) ? def_win_set.base_width : undefined;
            geo.base_height = !!(def_win_set.base_height > DEFAULT) ? def_win_set.base_height : undefined;
            geo.width_inc = !!(def_win_set.width_inc > DEFAULT_INC) ? def_win_set.width_inc : undefined;
            geo.height_inc = !!(def_win_set.height_inc > DEFAULT_INC) ? def_win_set.height_inc : undefined;

            def_win_set.min_width = DEFAULT;
            def_win_set.min_height = DEFAULT;
            def_win_set.base_height = DEFAULT;
            def_win_set.base_width = DEFAULT;
            def_win_set.height_inc = DEFAULT_INC;
            def_win_set.width_inc = DEFAULT_INC;

            gdk_window.set_geometry_hints(geo, Gdk.WindowHints.MIN_SIZE | Gdk.WindowHints.BASE_SIZE | Gdk.WindowHints.RESIZE_INC);
        }
    }
}

const BLACKLIST: string[] = [
    'Conky',
    'Com.github.donadigo.eddy',
    'Gnome-screenshot',
    'Authy Desktop',
    'jetbrains-toolbox'
];

/// Activates a window, and moves the mouse point to the center of it.
export function activate(win: Meta.Window) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());
    place_pointer_on(win)
}

export function blacklisted(window_class: string, title: string): boolean {
    return BLACKLIST.indexOf(window_class) > -1
        || (window_class === "Steam" && title !== "Steam")
        || (window_class === "TelegramDesktop" && title === "Media viewer")
        || (window_class === "KotatogramDesktop" && title === "Media viewer");
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
