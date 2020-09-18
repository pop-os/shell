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
const { Gdk, Meta, Shell, St, GLib } = imports.gi;

const { OnceCell } = once_cell;

export var window_tracker = Shell.WindowTracker.get_default();

const WM_TITLE_BLACKLIST: Array<string> = [
    'Firefox',
    'Nightly', // Firefox Nightly
    'Tor Browser'
];

enum RESTACK_STATE {
    RAISED,
    WORKSPACE_CHANGED,
    NORMAL
}

enum RESTACK_SPEED {
    RAISED = 430,
    WORKSPACE_CHANGED = 300,
    NORMAL = 200
}

interface X11Info {
    normal_hints: once_cell.OnceCell<lib.SizeHint | null>;
    wm_role_: once_cell.OnceCell<string | null>;
    xid_: once_cell.OnceCell<string | null>;
}

export class ShellWindow {
    entity: Entity;
    meta: Meta.Window;
    ext: Ext;

    was_attached_to?: [Entity, boolean];

    // True if this window is currently smart-gapped
    smart_gapped: boolean = false;

    private was_hidden: boolean = false;

    private window_app: any;

    private extra: X11Info = {
        normal_hints: new OnceCell(),
        wm_role_: new OnceCell(),
        xid_: new OnceCell()
    };

    private _border: St.Bin = new St.Bin({ style_class: 'pop-shell-active-hint pop-shell-border-normal' });

    private _border_size = 0;

    constructor(entity: Entity, window: Meta.Window, window_app: any, ext: Ext) {
        this.window_app = window_app;

        this.entity = entity;
        this.meta = window;
        this.ext = ext;

        if (this.is_transient()) {
            window.make_above();
        }

        if (this.may_decorate()) {
            if (!window.is_client_decorated()) {
                if (ext.settings.show_title()) {
                    this.decoration_show(ext);
                } else {
                    this.decoration_hide(ext);
                }
            }
        }

        this._bind_window_events();

        this._border.connect('style-changed', () => {
            this._on_style_changed();
        });

        this._border.hide();

        global.window_group.add_child(this._border);

        if (this.meta.get_compositor_private()?.get_stage())
            this._on_style_changed();

        this._update_border_layout();
    }

    get border() {
        return this._border;
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

        this.was_hidden = true;

        this.decoration(ext, (xid) => xprop.set_hint(xid, xprop.MOTIF_HINTS, xprop.HIDE_FLAGS));
    }

    decoration_show(ext: Ext): void {
        if (!this.was_hidden) return;

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

    /**
     * Window is maximized, 0 gapped or smart gapped
     */
    is_max_screen(): boolean {
        return this.is_maximized() || this.ext.settings.gap_inner() === 0 || this.smart_gapped;
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
                    && (wm_class === null || !ext.conf.window_shall_float(wm_class, this.meta.get_title()));
            });
    }

    is_transient(): boolean {
        return this.meta.get_transient_for() !== null;
    }

    move(ext: Ext, rect: Rectangular, on_complete?: () => void) {
        const clone = Rect.Rectangle.from_meta(rect);
        const actor = this.meta.get_compositor_private();
        if (actor) {
            this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            this.meta.unmaximize(Meta.MaximizeFlags.VERTICAL);
            this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

            const entity_string = String(this.entity);

            this.hide_border();

            const onComplete = () => {
                ext.register({ tag: 2, window: this, kind: { tag: 1, rect: clone } });
                if (on_complete) ext.register_fn(on_complete);
                ext.tween_signals.delete(entity_string);
                if (this.meta.appears_focused) {
                    this.show_border();
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

    show_border() {
        if (this.ext.settings.active_hint()) {
            let border = this._border;
            if (!this.meta.is_fullscreen() &&
                this.same_workspace()) {
                border.show();
            }
            this.restack();
        }
    }

    same_workspace() {
        const workspace = this.meta.get_workspace();
        if (workspace) {
            let workspace_id = workspace.index();
            return workspace_id === global.workspace_manager.get_active_workspace_index()
        }
        return false;
    }

    /**
     * Sort the window group/always top group with each window border
     * @param updateState NORMAL, RAISED, WORKSPACE_CHANGED
     */
    restack(updateState: RESTACK_STATE = RESTACK_STATE.NORMAL) {

        let restackSpeed = RESTACK_SPEED.NORMAL;

        switch (updateState) {
            case RESTACK_STATE.NORMAL:
                restackSpeed = RESTACK_SPEED.NORMAL
                break;
            case RESTACK_STATE.RAISED:
                restackSpeed = RESTACK_SPEED.RAISED
                break;
            case RESTACK_STATE.WORKSPACE_CHANGED:
                restackSpeed = RESTACK_SPEED.WORKSPACE_CHANGED
                break;
        }

        GLib.timeout_add(GLib.PRIORITY_LOW, restackSpeed, () => {
            let border = this._border;
            let actor = this.meta.get_compositor_private();
            let win_group = global.window_group;

            if (actor && border && win_group) {
                // move the border above the window group first
                win_group.set_child_above_sibling(border, null);

                if (this.always_top_windows.length > 0) {
                    // honor the always-top windows
                    for (const above_actor of this.always_top_windows) {
                        if (actor != above_actor) {
                            if (border.get_parent() === above_actor.get_parent()) {
                                win_group.set_child_below_sibling(border, above_actor);
                            }
                        }
                    }

                    // finally, move the border above the current window actor
                    if (border.get_parent() === actor.get_parent()) {
                        win_group.set_child_above_sibling(border, actor);
                    }
                }
            }

            return false; // make sure it runs once
        });
    }

    get always_top_windows(): Clutter.Actor[] {
        let above_windows: Clutter.Actor[] = new Array();

        for (const actor of global.get_window_actors()) {
            if (actor && actor.get_meta_window() && actor.get_meta_window().is_above())
                above_windows.push(actor);
        }

        return above_windows;
    }

    hide_border() {
        let border = this._border;
        if (border)
            border.hide();
    }

    private _update_border_layout() {
        let frameRect = this.meta.get_frame_rect();
        let [frameX, frameY, frameWidth, frameHeight] = [frameRect.x, frameRect.y, frameRect.width, frameRect.height];

        let border = this._border;
        let borderSize = this._border_size;

        if (!this.is_max_screen()) {
            border.remove_style_class_name('pop-shell-border-maximize');
        } else {
            borderSize = 0;
            border.add_style_class_name('pop-shell-border-maximize');
        }

        border.set_position(frameX - borderSize, frameY - borderSize);
        border.set_size(frameWidth + (2 * borderSize), frameHeight + (2 * borderSize));

        this.restack();
    }

    private _bind_window_events() {
        let windowSignals = [
            this.meta.connect('size-changed', () => { this._window_changed() }),
            this.meta.connect('position-changed', () => { this._window_changed() }),
            this.meta.connect('workspace-changed', () => { this._workspace_changed() }),
            this.meta.connect('raised', () => { this._window_raised() }),
        ];

        let extWinSignals = this.ext.window_signals.get_or(this.entity, () => new Array());
        Array.prototype.push.apply(extWinSignals, windowSignals);
    }

    private _window_changed() {
        this.ext.show_border_on_focused();
        this._update_border_layout();
    }

    private _window_raised() {
        this.restack(RESTACK_STATE.RAISED);
        this.show_border();
    }

    private _workspace_changed() {
        this.restack(RESTACK_STATE.WORKSPACE_CHANGED);
    }

    private _on_style_changed() {
        let border = this._border;
        let borderNode = border.get_theme_node();
        this._border_size = borderNode.get_border_width(St.Side.TOP);
    }
}

/// Activates a window, and moves the mouse point to the center of it.
export function activate(win: Meta.Window) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());
    place_pointer_on(win)
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
