const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Forest from 'forest';
import * as Ecs from 'ecs';
import * as Focus from 'focus';
import * as GrabOp from 'grab_op';
import * as Keybindings from 'keybindings';
import * as Lib from 'lib';
import * as Log from 'log';
import * as PanelSettings from 'panel_settings';
import * as Rect from 'rectangle';
import * as Settings from 'settings';
import * as Tiling from 'tiling';
import * as Window from 'window';
import * as launcher from 'launcher';
import * as active_hint from 'active_hint';
import * as auto_tiler from 'auto_tiler';
import * as node from 'node';

import type { Entity } from 'ecs';
import type { Rectangle } from 'rectangle';
import type { Indicator } from 'panel_settings';
import type { Launcher } from './launcher';

const { Gio, Meta, St } = imports.gi;
const { cursor_rect, is_move_op } = Lib;
const { layoutManager, overview, panel, sessionMode } = imports.ui.main;
const Tags = Me.imports.tags;

const GLib: GLib = imports.gi.GLib;

const THEME_CONTEXT = St.ThemeContext.get_for_stage(global.stage);

export class Ext extends Ecs.World {
    private init: boolean = true;
    tiling: boolean = false;

    column_size: number = 128;
    row_size: number = 128;

    dpi: number = THEME_CONTEXT.scale_factor;

    gap_inner_half: number = 0;
    gap_inner: number = 0;
    gap_outer_half: number = 0;
    gap_outer: number = 0;

    switch_workspace_on_move: boolean = true;

    active_hint: active_hint.ActiveHint | null = null;
    overlay: Clutter.Actor;

    keybindings: Keybindings.Keybindings;
    settings: Settings.ExtensionSettings;
    focus_selector: Focus.FocusSelector;

    grab_op: GrabOp.GrabOp | null = null;
    prev_focused: Entity | null = null;
    last_focused: Entity | null = null;

    tiler: Tiling.Tiler;
    window_search: Launcher;

    icons: Ecs.Storage<any>;
    ids: Ecs.Storage<number>;
    monitors: Ecs.Storage<[number, number]>;
    names: Ecs.Storage<string>;
    snapped: Ecs.Storage<boolean>;
    tilable: Ecs.Storage<boolean>;
    windows: Ecs.Storage<Window.ShellWindow>;

    auto_tiler: auto_tiler.AutoTiler | null = null;

    signals: Map<GObject.Object, Array<number>> = new Map();

    constructor() {
        super();

        // Misc

        this.keybindings = new Keybindings.Keybindings(this);
        this.overlay = new St.BoxLayout({ style_class: "tile-preview", visible: false });
        this.settings = new Settings.ExtensionSettings();

        this.load_settings();

        // Storages

        this.icons = this.register_storage();
        this.ids = this.register_storage();
        this.monitors = this.register_storage();
        this.names = this.register_storage();
        this.tilable = this.register_storage();
        this.windows = this.register_storage();
        this.snapped = this.register_storage();

        // Dialogs

        this.window_search = new launcher.Launcher(this);

        // Systems

        this.focus_selector = new Focus.FocusSelector();
        this.tiler = new Tiling.Tiler(this);
    }

    activate_window(window: Window.ShellWindow | null) {
        if (window) {
            window.activate();
        }
    }

    active_monitor(): number {
        return global.display.get_current_monitor();
    }

    active_window_list(): Array<Window.ShellWindow> {
        let workspace = global.workspace_manager.get_active_workspace();
        return this.tab_list(Meta.TabList.NORMAL, workspace);
    }

    active_workspace(): number {
        return global.workspace_manager.get_active_workspace_index();
    }

    /// Connects a callback signal to a GObject, and records the signal.
    connect(object: GObject.Object, property: string, callback: (...args: any) => boolean | void) {
        const signal = object.connect(property, callback);
        const entry = this.signals.get(object);
        if (entry) {
            entry.push(signal);
        } else {
            this.signals.set(object, [signal]);
        }

    }

    connect_meta(win: Window.ShellWindow, signal: string, callback: () => void) {
        win.meta.connect(signal, () => {
            if (win.actor_exists()) callback();
        });
    }

    connect_window(win: Window.ShellWindow) {
        this.connect_meta(win, 'workspace-changed', () => this.on_workspace_changed(win));

        this.connect_meta(win, 'size-changed', () => {
            if (this.auto_tiler && !win.is_maximized()) {
                Log.debug(`size changed: ${win.name(this)}`);
                if (this.grab_op) {

                } else if (!this.tiling) {
                    this.auto_tiler.reflow(this, win.entity);
                }
            }
        });

        this.connect_meta(win, 'position-changed', () => {
            if (this.auto_tiler && !this.grab_op && !this.tiling && !win.is_maximized()) {
                Log.debug(`position changed: ${win.name(this)}`);
                this.auto_tiler.reflow(this, win.entity);
            }
        });

        this.connect_meta(win, 'notify::minimized', () => {
            if (this.auto_tiler) {
                if (win.meta.minimized) {
                    if (this.auto_tiler) {

                    }
                    if (this.auto_tiler.attached.contains(win.entity)) {
                        this.auto_tiler.detach_window(this, win.entity);
                    }
                } else if (!this.contains_tag(win.entity, Tags.Floating)) {
                    this.auto_tiler.auto_tile(this, win, false);
                }
            }
        });
    }

    exit_modes() {
        this.tiler.exit(this);
        this.window_search.close();
    }

    focus_window(): Window.ShellWindow | null {
        let focused = this.get_window(global.display.get_focus_window())
        if (!focused && this.last_focused) {
            focused = this.windows.get(this.last_focused);
        }
        return focused;
    }

    /// Fetches the window component from the entity associated with the metacity window metadata.
    get_window(meta: Meta.Window | null): Window.ShellWindow | null {
        let entity = this.window_entity(meta);
        return entity ? this.windows.get(entity) : null;
    }

    load_settings() {
        this.set_gap_inner(this.settings.gap_inner())
        this.set_gap_outer(this.settings.gap_outer());
        this.column_size = this.settings.column_size();
        this.row_size = this.settings.row_size();

        if (this.settings.active_hint() && !this.active_hint) {
            this.active_hint = new active_hint.ActiveHint(this.dpi);
        }
    }

    monitor_work_area(monitor: number): Rectangle {
        const meta = global.display.get_workspace_manager()
            .get_active_workspace()
            .get_work_area_for_monitor(monitor);

        return Rect.Rectangle.from_meta(meta);
    }

    on_destroy(win: Entity) {
        Log.debug(`destroying window (${win}): ${this.names.get(win)}`);

        if (this.last_focused == win) {
            this.active_hint?.untrack();

            this.last_focused = null;

            if (this.auto_tiler) {
                const entity = this.auto_tiler.attached.get(win);
                if (entity) {
                    const fork = this.auto_tiler.forest.forks.get(entity);
                    if (fork?.right?.is_window(win)) {
                        this.windows.with(fork.right.entity, (sibling) => sibling.activate())
                    }
                }
            }
        }

        if (this.auto_tiler) this.auto_tiler.detach_window(this, win);

        this.delete_entity(win);
    }

    /**
     * Triggered when a window has been focused
     *
     * @param {ShellWindow} win
     */
    on_focused(win: Window.ShellWindow) {
        this.exit_modes();
        this.prev_focused = this.last_focused;
        this.last_focused = win.entity;

        this.active_hint?.track(win);

        let msg = `focused Window(${win.entity}) {\n`
            + `  name: ${win.name(this)},\n`
            + `  rect: ${win.rect().fmt()},\n`
            + `  wm_class: "${win.meta.get_wm_class()}",\n`
            + `  monitor: ${win.meta.get_monitor()},\n`
            + `  workspace: ${win.workspace_id()},\n`
            + `  cmdline: ${win.cmdline()},\n`;

        if (this.auto_tiler) {
            msg += `  fork: (${this.auto_tiler.attached.get(win.entity)}),\n`;
        }

        Log.info(msg + '}');
    }

    /**
     * Triggered when a grab operation has been ended
     *
     * @param {Meta.Window} meta
     * @param {*} op
     */
    on_grab_end(meta: Meta.Window, op: any) {
        let win = this.get_window(meta);

        if (null == win || !win.is_tilable(this)) {
            return;
        }

        if (win.is_maximized()) {
            return;
        }

        if (win && this.grab_op && Ecs.entity_eq(this.grab_op.entity, win.entity)) {
            let crect = win.rect()

            if (this.auto_tiler) {
                const rect = this.grab_op.rect;
                if (is_move_op(op)) {
                    Log.debug(`win: ${win.name(this)}; op: ${op}; from (${rect.x},${rect.y}) to (${crect.x},${crect.y})`);

                    this.on_monitor_changed(win, (changed_from, changed_to, workspace) => {
                        if (win) {
                            Log.debug(`window ${win.name(this)} moved from display ${changed_from} to ${changed_to}`);
                            this.monitors.insert(win.entity, [changed_to, workspace]);
                        }
                    });

                    if (rect.x != crect.x || rect.y != crect.y) {
                        if (rect.contains(cursor_rect())) {
                            this.auto_tiler.reflow(this, win.entity);
                        } else {
                            this.auto_tiler.on_drop(this, win);
                        }
                    }
                } else {
                    const fork = this.auto_tiler.attached.get(win.entity);
                    if (fork) {
                        const component = this.auto_tiler.forest.forks.get(fork);
                        if (component) {
                            const movement = this.grab_op.operation(crect);

                            Log.debug(`resizing window: from [${rect.fmt()} to ${crect.fmt()}]`);

                            this.auto_tiler.forest.resize(this, fork, component, win.entity, movement, crect);
                            this.auto_tiler.forest.arrange(this, component.workspace);
                            Log.debug(`changed to: ${this.auto_tiler.forest.fmt(this)}`);
                        } else {
                            Log.error(`no fork component found`);
                        }

                    } else {
                        Log.error(`no fork entity found`);
                    }
                }
            } else if (this.settings.snap_to_grid()) {
                this.tiler.snap(this, win);
            }
        } else {
            Log.error(`mismatch on grab op entity`);
        }

        this.grab_op = null;
    }

    /**
     * Triggered when a grab operation has been started
     *
     * @param {Meta.Window} meta
     * @param {*} op
     */
    on_grab_start(meta: Meta.Window) {
        Log.info(`grab start`);
        let win = this.get_window(meta);
        if (win && win.is_tilable(this)) {
            let entity = win.entity;
            Log.debug(`grabbed Window(${entity}): ${this.names.get(entity)}`);
            let rect = win.rect();
            this.grab_op = new GrabOp.GrabOp(entity, rect);
        }
    }

    /// Handles the event of a window moving from one monitor to another.
    on_monitor_changed(
        win: Window.ShellWindow,
        func: (exp_mon: null | number, act_mon: number, act_work: number) => void
    ) {
        const actual_monitor = win.meta.get_monitor();
        const actual_workspace = win.workspace_id();
        const monitor = this.monitors.get(win.entity);
        if (monitor) {
            const [expected_monitor, expected_workspace] = monitor;
            if (expected_monitor != actual_monitor || actual_workspace != expected_workspace) {
                func(expected_monitor, actual_monitor, actual_workspace);
            }
        } else {
            func(null, actual_monitor, actual_workspace);
        }
    }

    on_window_create(window: Meta.Window) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            let win = this.get_window(window);
            let actor = window.get_compositor_private();
            if (win && actor) {
                const entity = win.entity;
                actor.connect('destroy', () => {
                    if (win) this.on_destroy(entity);
                    return false;
                });

                if (win.is_tilable(this)) {
                    this.connect_window(win);
                }
            }

            return false;
        });
    }

    on_workspace_changed(win: Window.ShellWindow) {
        if (!this.grab_op) {
            Log.debug(`workspace changed for ${win.name(this)}`);
            if (this.auto_tiler) {
                const id = this.workspace_id(win);
                const prev_id = this.monitors.get(win.entity);
                if (!prev_id || id[0] != prev_id[0] || id[1] != prev_id[1]) {
                    Log.debug(`workspace changed from (${prev_id}) to (${id})`);
                    this.monitors.insert(win.entity, id);
                    this.auto_tiler.detach_window(this, win.entity);
                    this.auto_tiler.attach_to_workspace(this, win, id);
                }
            }
        }
    }

    set_gap_inner(gap: number) {
        this.gap_inner = gap * 4 * this.dpi;
        this.gap_inner_half = this.gap_inner / 2;
    }

    set_gap_outer(gap: number) {
        this.gap_outer = gap * 4 * this.dpi;
        this.gap_outer_half = this.gap_outer / 2;
    }

    set_overlay(rect: Rectangle) {
        this.overlay.x = rect.x;
        this.overlay.y = rect.y;
        this.overlay.width = rect.width;
        this.overlay.height = rect.height;
    }

    /** Begin listening for signals from windows, and add any pre-existing windows. */
    signals_attach() {
        const workspace_manager = global.display.get_workspace_manager();

        this.connect(sessionMode, 'updated', () => {
            if ('user' != global.sessionMode.currentMode()) {
                this.exit_modes();
            }
            return true;
        });

        this.connect(overview, 'showing', () => {
            this.exit_modes();
            return true;
        });

        // We have to connect this signal in an idle_add; otherwise work areas stop being calculated
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.connect(global.display, 'notify::focus-window', () => {
                const window = this.focus_window();
                if (window) {
                    this.on_focused(window);
                }

                return true;
            });

            const window = this.focus_window();
            if (window) {
                this.on_focused(window);
            }

            return false;
        });

        this.connect(global.display, 'window_created', (_, win) => {
            this.on_window_create(win);
            return true;
        });

        this.connect(global.display, 'grab-op-begin', (_, _display, win) => {
            this.on_grab_start(win);
            return true;
        });

        this.connect(global.display, 'grab-op-end', (_, _display, win, op) => {
            this.on_grab_end(win, op);
            return true;
        });

        this.connect(workspace_manager, 'active-workspace-changed', () => {
            if (this.active_hint) {
                this.active_hint.untrack();
            }

            this.exit_modes();
            this.last_focused = null;
            return true;
        });

        /** When a workspace is destroyed, we need to update state to have the correct workspace info.  */
        this.connect(workspace_manager, 'workspace-removed', (_, number) => {
            Log.info(`workspace ${number} was removed`);

            if (this.auto_tiler) {
                for (const [entity, monitor] of this.auto_tiler.forest.toplevel.values()) {
                    if (monitor[1] > number) {
                        Log.info(`moving tree from Fork(${entity})`);

                        monitor[1] -= 1;
                        let fork = this.auto_tiler.forest.forks.get(entity);
                        if (fork) {
                            fork.workspace -= 1;
                            for (const child of this.auto_tiler.forest.iter(entity, node.NodeKind.FORK)) {
                                fork = this.auto_tiler.forest.forks.get(child.entity);
                                if (fork) fork.workspace -= 1;
                            }
                        }
                    }
                }
            }

            for (const [entity, monitor] of this.monitors.iter()) {
                if (monitor[1] > number) {
                    Log.info(`moving window from Window(${entity})`);
                    monitor[1] -= 1;
                }
            }
        });

        // Modes

        if (this.settings.tile_by_default()) {
            Log.info(`tile by default enabled`);

            this.auto_tiler = new auto_tiler.AutoTiler(
                new Forest.Forest()
                    .connect_on_attach((entity: Entity, window: Entity) => {
                        if (this.auto_tiler) {
                            Log.debug(`attached Window(${window}) to Fork(${entity})`);
                            this.auto_tiler.attached.insert(window, entity);
                        }
                    }),
                this.register_storage<Entity>(),
            )
        }

        // Post-init

        for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
            this.on_window_create(window.meta);
        }

        GLib.timeout_add(1000, GLib.PRIORITY_DEFAULT, () => {
            this.init = false;
            Log.debug(`init complete`);
            return false;
        });
    }

    signals_remove() {
        for (const [object, signals] of this.signals) {
            for (const signal of signals) {
                object.disconnect(signal);
            }
        }

        this.signals.clear();
    }

    // Snaps all windows to the window grid
    snap_windows() {
        for (const window of this.windows.values()) {
            if (window.is_tilable(this)) this.tiler.snap(this, window);
        }
    }

    /** Switch to a workspace by its index */
    switch_to_workspace(id: number) {
        this.workspace_by_id(id)?.activate(global.get_current_time());
    }

    /** Fetch a workspace by its index */
    workspace_by_id(id: number): Meta.Workspace | null {
        return global.display.get_workspace_manager().get_workspace_by_index(id);
    }

    tab_list(tablist: number, workspace: number | null): Array<Window.ShellWindow> {
        return global.display
            .get_tab_list(tablist, workspace)
            .map((win: Meta.Window) => this.get_window(win));
    }

    * tiled_windows(): IterableIterator<Entity> {
        for (const entity of this.entities()) {
            if (this.contains_tag(entity, Tags.Tiled)) {
                yield entity;
            }
        }
    }

    update_snapped() {
        for (const entity of this.snapped.find((val) => val)) {
            const window = this.windows.get(entity);
            if (window) this.tiler.snap(this, window);
        }
    }

    /// Fetches the window entity which is associated with the metacity window metadata.
    window_entity(meta: Meta.Window | null): Entity | null {
        if (!meta) return null;

        let id: number;

        try {
            id = meta.get_stable_sequence();
        } catch (e) {
            return null;
        }

        // Locate the window entity with the matching ID
        let entity = this.ids.find((comp) => comp == id).next().value;

        // If not found, create a new entity with a ShellWindow component.
        if (!entity) {
            let window_app: any, name: string;

            try {
                window_app = Window.window_tracker.get_window_app(meta);
                name = window_app.get_name().replace(/&/g, "&amp;");
            } catch (e) {
                return null;
            }

            entity = this.create_entity();

            let win = new Window.ShellWindow(entity, meta, window_app, this);

            this.windows.insert(entity, win);
            this.ids.insert(entity, id);
            this.names.insert(entity, name);
            this.monitors.insert(entity, [win.meta.get_monitor(), win.workspace_id()]);

            Log.debug(`created window (${win.entity}): ${win.name(this)}: ${id}`);
            const actor = meta.get_compositor_private();
            if (this.auto_tiler && win.is_tilable(this) && actor) {
                let id = actor.connect('first-frame', () => {
                    this.auto_tiler?.auto_tile(this, win, this.init);
                    actor.disconnect(id);
                });
            }
        }
        return entity;
    }

    /// Returns the window(s) that the mouse pointer is currently hoving above.
    * windows_at_pointer(
        cursor: Rectangle,
        monitor: number,
        workspace: number
    ): IterableIterator<Window.ShellWindow> {
        for (const entity of this.monitors.find((m) => m[0] == monitor && m[1] == workspace)) {
            let window = this.windows.with(entity, (window) => {
                return window.rect().contains(cursor) ? window : null;
            });

            if (window) yield window;
        }
    }

    cursor_status(): [Rectangle, number] {
        const cursor = cursor_rect();
        const rect = new Meta.Rectangle({ x: cursor.x, y: cursor.y, width: 1, height: 1 });
        const monitor = global.display.get_monitor_index_for_rect(rect);
        return [cursor, monitor];
    }

    workspace_id(window: Window.ShellWindow | null = null): [number, number] {
        Log.debug(`fetching workspace ID`);

        let id: [number, number] = window
            ? [window.meta.get_monitor(), window.workspace_id()]
            : [this.active_monitor(), this.active_workspace()];

        Log.debug(`fetched workspace ID: ${id}`);

        id[0] = Math.max(0, id[0]);
        id[1] = Math.max(0, id[1]);

        return id;
    }
}

let ext: Ext | null = null;
let indicator: Indicator | null = null;

// @ts-ignore
function init() {
    Log.info("init");

    ext = new Ext();

    // Code to execute after the shell has finished initializing everything.
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
        if (ext?.auto_tiler) ext.snap_windows();
        return false;
    });
}

// @ts-ignore
function enable() {
    if (ext) {
        Log.info("enable");

        ext.signals_attach();

        load_theme();

        layoutManager.addChrome(ext.overlay);

        if (!indicator) {
            indicator = new PanelSettings.Indicator(ext);
            panel.addToStatusArea('pop-shell', indicator.button);
        }

        ext.keybindings.enable(ext.keybindings.global)
            .enable(ext.keybindings.window_focus);
    }
}

// @ts-ignore
function disable() {
    Log.info("disable");

    if (indicator) {
        indicator.button.destroy();
        indicator = null;
    }

    if (ext) {
        ext.signals_remove();
        ext.exit_modes();

        layoutManager.removeChrome(ext.overlay);

        ext.keybindings.disable(ext.keybindings.global)
            .disable(ext.keybindings.window_focus)
    }
}

// Supplements the GNOME Shell theme with the extension's theme.
function load_theme() {
    try {
        Log.info(`loading theme`)
        let application = Gio.File.new_for_path(Me.path + "/stylesheet.css");

        Log.info(`setting theme`);
        THEME_CONTEXT.get_theme().load_stylesheet(application);

        Log.info(`theme set`);
    } catch (e) {
        Log.error("failed to load stylesheet: " + e);
    }
}
