// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Config from 'config';
import * as lib from 'lib';
import * as log from 'log';
import * as once_cell from 'once_cell';
import * as Rect from 'rectangle';
import * as Tags from 'tags';
import * as Tweener from 'tweener';
import * as utils from 'utils';
import * as xprop from 'xprop';
import type { Entity } from './ecs';
import type { Ext } from './extension';
import type { Rectangle } from './rectangle';


const { DefaultPointerPosition } = Config;
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
    stack: number | null = null;
    known_workspace: number;
    grab: boolean = false;
    activate_after_move: boolean = false;
    ignore_detach: boolean = false;
    was_attached_to?: [Entity, boolean | number];

    // Awaiting reassignment after a display update
    reassignment: boolean = false

    // True if this window is currently smart-gapped
    smart_gapped: boolean = false;

    border: St.Bin = new St.Bin({ style_class: 'pop-shell-active-hint pop-shell-border-normal' });

    prev_rect: null | Rectangular = null;

    private was_hidden: boolean = false;

    private window_app: any;

    private extra: X11Info = {
        normal_hints: new OnceCell(),
        wm_role_: new OnceCell(),
        xid_: new OnceCell()
    };

    private border_size = 0;

    constructor(entity: Entity, window: Meta.Window, window_app: any, ext: Ext) {
        this.window_app = window_app;

        this.entity = entity;
        this.meta = window;
        this.ext = ext;

        this.known_workspace = this.workspace_id()

        if (this.may_decorate()) {
            if (!window.is_client_decorated()) {
                if (ext.settings.show_title()) {
                    this.decoration_show(ext);
                } else {
                    this.decoration_hide(ext);
                }
            }
        }

        this.bind_window_events();
        this.bind_hint_events();

        global.window_group.add_child(this.border);

        this.hide_border();
        this.restack();
        this.update_border_layout();

        if (this.meta.get_compositor_private()?.get_stage())
            this.on_style_changed();

    }

    activate(): void {
        activate(this.ext.conf.default_pointer_position, this.meta);
    }

    actor_exists(): boolean {
        return this.meta.get_compositor_private() !== null;
    }

    private bind_window_events() {
        this.ext.window_signals.get_or(this.entity, () => new Array())
            .push(
                this.meta.connect('size-changed', () => { this.window_changed() }),
                this.meta.connect('position-changed', () => { this.window_changed() }),
                this.meta.connect('workspace-changed', () => { this.workspace_changed() }),
                this.meta.connect('raised', () => { this.window_raised() }),
            );
    }

    private bind_hint_events() {
        let settings = this.ext.settings;
        let change_id = settings.ext.connect('changed', (_, key) => {
            if (this.border) {
                if (key === 'hint-color-rgba') {
                    this.update_hint_colors();
                }
            }
            return false;
        });

        this.border.connect('destroy', () => { settings.ext.disconnect(change_id) });
        this.border.connect('style-changed', () => {
            this.on_style_changed();
        });

        this.update_hint_colors();
    }

    /**
     * Adjust the colors for:
     * - border hint
     * - overlay
     */
    private update_hint_colors() {
        let settings = this.ext.settings;
        const color_value = settings.hint_color_rgba();

        if (this.ext.overlay) {
            const gdk = new Gdk.RGBA();
            // TODO Probably move overlay color/opacity to prefs.js in future,
            // For now mimic the hint color with lower opacity
            const overlay_alpha = 0.3;
            const orig_overlay = 'rgba(53, 132, 228, 0.3)';
            gdk.parse(color_value);

            if (utils.is_dark(gdk.to_string())) {
                // too dark, use the blue overlay
                gdk.parse(orig_overlay);
            }

            gdk.alpha = overlay_alpha
            this.ext.overlay.set_style(`background: ${gdk.to_string()}`);
        }

        if (this.border)
            this.border.set_style(`border-color: ${color_value}`);
    }

    cmdline(): string | null {
        let pid = this.meta.get_pid(), out = null;
        if (-1 === pid) return out;

        const path = '/proc/' + pid + '/cmdline';
        if (!utils.exists(path)) return out;

        const result = utils.read_to_string(path);
        if (result.kind == 1) {
            out = result.value.trim();
        } else {
            log.error(`failed to fetch cmdline: ${result.value.format()}`);
        }

        return out;
    }

    private decoration(_ext: Ext, callback: (xid: string) => void): void {
        if (this.may_decorate()) {
            const xid = this.xid();
            if (xid) callback(xid);
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

    is_maximized(): boolean {
        return this.meta.get_maximized() !== 0;
    }

    /**
     * Window is maximized, 0 gapped or smart gapped
     */
    is_max_screen(): boolean {
        // log.debug(`title: ${this.meta.get_title()}`);
        // log.debug(`max: ${this.is_maximized()}, 0-gap: ${this.ext.settings.gap_inner() === 0}, smart: ${this.smart_gapped}`);
        return this.is_maximized() || this.ext.settings.gap_inner() === 0 || this.smart_gapped;
    }

    is_tilable(ext: Ext): boolean {
        let tile_checks = () => {
            let wm_class = this.meta.get_wm_class();

            if (wm_class !== null && wm_class.trim().length === 0) {
                wm_class = this.name(ext)
            }

            return !this.meta.is_skip_taskbar()
                // Only normal windows will be considered for tiling
                && this.meta.window_type == Meta.WindowType.NORMAL
                // Transient windows are most likely dialogs
                && !this.is_transient()
                // If a window lacks a class, it's probably a web browser dialog
                && wm_class !== null
                // Blacklist any windows that happen to leak through our filter
                && !ext.conf.window_shall_float(wm_class, this.meta.get_title());
        };

        return !ext.contains_tag(this.entity, Tags.Floating)
            && tile_checks()
    }

    is_transient(): boolean {
        return this.meta.get_transient_for() !== null;
    }

    may_decorate(): boolean {
        const xid = this.xid();
        return xid ? xprop.may_decorate(xid) : false;
    }

    move(ext: Ext, rect: Rectangular, on_complete?: () => void, animate: boolean = true) {
        if ((!this.same_workspace() && this.is_maximized())) {
            return
        }

        this.hide_border();
        const clone = Rect.Rectangle.from_meta(rect);
        const meta = this.meta;
        const actor = meta.get_compositor_private();

        if (actor) {
            meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            meta.unmaximize(Meta.MaximizeFlags.VERTICAL);
            meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

            const entity_string = String(this.entity);
            ext.movements.insert(this.entity, clone);

            const onComplete = () => {
                ext.register({ tag: 2, window: this, kind: { tag: 1 } });
                if (on_complete) ext.register_fn(on_complete);
                ext.tween_signals.delete(entity_string);
                if (meta.appears_focused) {
                    this.update_border_layout();
                    this.show_border();
                }
            };

            if (animate && ext.animate_windows && !ext.init) {
                const current = meta.get_frame_rect();
                const buffer = meta.get_buffer_rect();

                const dx = current.x - buffer.x;
                const dy = current.y - buffer.y;

                const slot = ext.tween_signals.get(entity_string);
                if (slot !== undefined) {
                    const [signal, callback] = slot;
                    Tweener.remove(actor);

                    utils.source_remove(signal);
                    callback();
                }

                const x = clone.x - dx;
                const y = clone.y - dy;

                const duration = ext.tiler.moving ? 49 : 149;

                Tweener.add(this, { x, y, duration, mode: null });

                ext.tween_signals.set(entity_string, [
                    Tweener.on_window_tweened(this, onComplete),
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

    private on_style_changed() {
        this.border_size = this.border.get_theme_node().get_border_width(St.Side.TOP);
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
        this.move(ext, br, () => place_pointer_on(this.ext.conf.default_pointer_position, this.meta));
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
        this.restack();
        if (this.ext.settings.active_hint()) {
            let border = this.border;
            if (!this.meta.is_fullscreen() &&
                !this.meta.minimized &&
                this.same_workspace()) {
                if (this.meta.appears_focused) {
                    border.show();
                }
            }
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
        this.update_border_layout();

        if (this.meta.is_fullscreen()) {
            this.hide_border()
        }

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
            let border = this.border;
            let actor = this.meta.get_compositor_private();
            let win_group = global.window_group;

            if (actor && border && win_group) {
                this.update_border_layout();
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

                    // Move the border above the current window actor
                    if (border.get_parent() === actor.get_parent()) {
                        win_group.set_child_above_sibling(border, actor);
                    }
                }

                // Honor transient windows
                for (const window of this.ext.windows.values()) {
                    const parent = window.meta.get_transient_for()
                    const window_actor = window.meta.get_compositor_private();
                    if (!parent || !window_actor) continue
                    const parent_actor = parent.get_compositor_private()
                    if (!parent_actor && parent_actor !== actor) continue
                    win_group.set_child_below_sibling(border, window_actor)
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
        let b = this.border;
        if (b) b.hide();
    }

    update_border_layout() {
        let {x, y, width, height} = this.meta.get_frame_rect();

        const border = this.border;
        let borderSize = this.border_size;

        if (border) {
            if (!this.is_max_screen()) {
                border.remove_style_class_name('pop-shell-border-maximize');
            } else {
                borderSize = 0;
                border.add_style_class_name('pop-shell-border-maximize');
            }

            const stack_number = this.stack;
            let dimensions = null

            if (stack_number !== null) {
                const stack = this.ext.auto_tiler?.forest.stacks.get(stack_number);
                if (stack) {
                    let stack_tab_height = stack.tabs_height;

                    if (borderSize === 0 || this.grab === null) { // not in max screen state
                        stack_tab_height = 0;
                    }

                    dimensions = [
                        x - borderSize,
                        y - stack_tab_height - borderSize,
                        width + 2 * borderSize,
                        height + stack_tab_height + 2 * borderSize
                    ]
                }
            } else {
                dimensions = [
                    x - borderSize,
                    y - borderSize,
                    width + (2 * borderSize),
                    height + (2 * borderSize)
                ]
            }

            if (dimensions) {
                [x, y, width, height] = dimensions

                const screen = global
                    .workspace_manager
                    .get_active_workspace()
                    .get_work_area_for_monitor(global.display.get_current_monitor())

                if (screen) {
                    x = Math.max(x, screen.x)
                    y = Math.max(y, screen.y)
                    width = Math.min(width, screen.x + screen.width)
                    height = Math.min(height, screen.y + screen.height)
                }

                border.set_position(x, y)
                border.set_size(width, height)
            }
        }
    }

    private window_changed() {
        this.update_border_layout();
        this.show_border();
    }

    private window_raised() {
        this.restack(RESTACK_STATE.RAISED);
        this.show_border();
        if (this.ext.conf.move_pointer_on_switch && !pointer_already_on_window(this.meta)) {
            place_pointer_on(this.ext.conf.default_pointer_position, this.meta);
        }
    }

    private workspace_changed() {
        this.restack(RESTACK_STATE.WORKSPACE_CHANGED);
    }
}

/// Activates a window, and moves the mouse point.
export function activate(default_pointer_position: Config.DefaultPointerPosition, win: Meta.Window) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());

    if (!pointer_already_on_window(win)) {
        place_pointer_on(default_pointer_position, win)
    }
}

export function place_pointer_on(default_pointer_position: Config.DefaultPointerPosition, win: Meta.Window) {
    const rect = win.get_frame_rect();
    let x = rect.x;
    let y = rect.y;

    switch (default_pointer_position) {
        case DefaultPointerPosition.TopLeft:
            x += 8;
            y += 8;
            break;
        case DefaultPointerPosition.BottomLeft:
            x += 8;
            y += (rect.height - 16);
            break;
        case DefaultPointerPosition.TopRight:
            x += (rect.width - 16);
            y += 8;
            break;
        case DefaultPointerPosition.BottomRight:
            x += (rect.width - 16);
            y += (rect.height - 16);
            break;
        case DefaultPointerPosition.Center:
            x += (rect.width / 2) + 8;
            y += (rect.height / 2) + 8;
            break;
        default:
            x += 8;
            y += 8;
    }

    const display = Gdk.DisplayManager.get().get_default_display();

    display
        .get_default_seat()
        .get_pointer()
        .warp(display.get_default_screen(), x, y);
}

function pointer_already_on_window(meta: Meta.Window): boolean {
    const cursor = lib.cursor_rect()

    return cursor.intersects(meta.get_frame_rect())
}