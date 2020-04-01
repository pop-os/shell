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
import * as utils from 'utils';

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

enum Style {
    Light,
    Dark
}

interface Display {
    area: Rectangle;
    ws: Rectangle;
}

function display_fmt(display: Display): string {
    return `Display { area: ${display.area.fmt()}, ws: ${display.ws.fmt()} }`;
}

interface Monitor extends Rectangular {
    index: number;
}

export class Ext extends Ecs.World {
    /** Mechanism for managing keybindings */
    keybindings: Keybindings.Keybindings = new Keybindings.Keybindings(this);

    /** Manage interactions with GSettings */
    settings: Settings.ExtensionSettings = new Settings.ExtensionSettings();

    // Widgets


    /** Displays a border hint around active windows */
    active_hint: active_hint.ActiveHint | null = null;

    /** An overlay which shows a preview of where a window will be moved */
    overlay: Clutter.Actor = new St.BoxLayout({ style_class: "tile-preview", visible: false });

    /** The application launcher, focus search, and calculator dialog */
    window_search: Launcher = new launcher.Launcher(this);


    // State

    /** Animate window movements */
    animate_windows: boolean = true;

    /** Column sizes in snap-to-grid */
    column_size: number = 128;

    /** Row size in snap-to-grid */
    row_size: number = 128;

    /** The known display configuration, for tracking monitor removals and changes */
    displays: Map<number, Display> = new Map();

    /** The current scaling factor in GNOME Shell */
    dpi: number = THEME_CONTEXT.scale_factor;

    /** The number of pixels between windows */
    gap_inner: number = 0;

    /** Exactly half of the value of the inner gap */
    gap_inner_half: number = 0;

    /** Previously-set value of the inner gap */
    gap_inner_prev: number = 0;

    /** The number of pixels around a display's work area */
    gap_outer: number = 0;

    /** Previously-set value of the outer gap */
    gap_outer_prev: number = 0;

    /** Information about a current possible grab operation */
    grab_op: GrabOp.GrabOp | null = null;

    /** The last window that was focused */
    last_focused: Entity | null = null;

    /** The window that was focused before the last window */
    prev_focused: Entity | null = null;

    /** Track if workspaces should switch on window movements */
    switch_workspace_on_move: boolean = true;

    /** Initially set to true when the extension is initializing */
    init: boolean = true;

    /** Record of misc. global objects and their attached signals */
    private signals: Map<GObject.Object, Array<SignalID>> = new Map();


    // Entity-component associations


    /** Store for generated icons from applications */
    icons: Ecs.Storage<any> = this.register_storage();

    /** Store for stable sequences of each registered window */
    ids: Ecs.Storage<number> = this.register_storage();

    /** Store for keeping track of which monitor + workspace a window is on */
    monitors: Ecs.Storage<[number, number]> = this.register_storage();

    /** Store for names associated with windows */
    names: Ecs.Storage<string> = this.register_storage();

    /** Store for size-changed signals attached to each window */
    size_signals: Ecs.Storage<[SignalID, SignalID, SignalID]> = this.register_storage();

    /** Set to true if a window is snapped to the grid */
    snapped: Ecs.Storage<boolean> = this.register_storage();

    /** Set the true if the window is tilable */
    tilable: Ecs.Storage<boolean> = this.register_storage();

    /** Primary storage for the window entities, containing the actual window */
    windows: Ecs.Storage<Window.ShellWindow> = this.register_storage();

    // Systems

    /** Manages automatic tiling behaviors in the shell */
    auto_tiler: auto_tiler.AutoTiler | null = null;

    /** Performs focus selections */
    focus_selector: Focus.FocusSelector = new Focus.FocusSelector();

    /** Calculates window placements when tiling and focus-switching */
    tiler: Tiling.Tiler = new Tiling.Tiler(this);

    constructor() {
        super();

        this.load_settings();

        let current_style = this.settings.is_dark() ? Style.Dark : Style.Light;
        this.load_theme(current_style);
        this.settings.int.connect('changed::gtk-theme', () => {
            if (this.settings.is_dark()) {
                if (current_style === Style.Light) {
                    current_style = Style.Dark;
                    this.load_theme(current_style);
                }
            } else if (current_style === Style.Dark) {
                current_style = Style.Light;
                this.load_theme(current_style);
            }
        });
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

    connect_meta(win: Window.ShellWindow, signal: string, callback: () => void): number {
        return win.meta.connect(signal, () => {
            if (win.actor_exists()) callback();
        });
    }

    connect_window(win: Window.ShellWindow) {
        this.size_signals.insert(win.entity, [
            this.connect_meta(win, 'size-changed', () => {
                if (this.auto_tiler && !win.is_maximized()) {
                    Log.debug(`size changed: ${win.name(this)}`);
                    this.auto_tiler.reflow(this, win.entity);
                }
            }),
            this.connect_meta(win, 'position-changed', () => {
                if (this.auto_tiler && !win.is_maximized()) {
                    Log.debug(`position changed: ${win.name(this)}`);
                    this.auto_tiler.reflow(this, win.entity);
                }
            }),
            this.connect_meta(win, 'workspace-changed', () => this.on_workspace_changed(win)),
        ]);

        this.connect_meta(win, 'notify::minimized', () => {
            if (this.auto_tiler) {
                if (win.meta.minimized) {
                    if (this.active_hint && this.active_hint.is_tracking(win.entity)) {
                        this.active_hint.untrack();
                    }

                    if (this.auto_tiler.attached.contains(win.entity)) {
                        this.auto_tiler.detach_window(this, win.entity);
                    }
                } else if (!this.contains_tag(win.entity, Tags.Floating)) {
                    this.auto_tiler.auto_tile(this, win, false);
                }
            }
        });

        this.connect_meta(win, 'notify::maximized_horizontally', () => this.on_maximize(win));
        this.connect_meta(win, 'notify::maximized_vertically', () => this.on_maximize(win));
    }

    exit_modes() {
        this.tiler.exit(this);
        this.window_search.close();
    }

    find_monitor_to_retach(width: number, height: number): [number, Display] {
        if (!this.settings.workspaces_only_on_primary()) {
            for (const [index, display] of this.displays) {
                if (display.area.width == width && display.area.height == height) {
                    return [index, display];
                }
            }
        }

        const primary: number = global.display.get_primary_monitor();
        return [primary, this.displays.get(primary) as Display];
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
        this.set_gap_inner(this.settings.gap_inner());
        this.set_gap_outer(this.settings.gap_outer());
        this.gap_inner_prev = this.gap_inner;
        this.gap_outer_prev = this.gap_outer;

        this.column_size = this.settings.column_size();
        this.row_size = this.settings.row_size();

        if (this.settings.active_hint() && !this.active_hint) {
            this.active_hint = new active_hint.ActiveHint(this.dpi);
        }
    }

    load_theme(style: Style) {
        load_theme(style === Style.Dark ? 'dark' : 'light');
    }

    monitor_work_area(monitor: number): Rectangle {
        const meta = global.display.get_workspace_manager()
            .get_active_workspace()
            .get_work_area_for_monitor(monitor);

        return Rect.Rectangle.from_meta(meta);
    }

    on_active_hint() {
        if (this.settings.active_hint()) {
            this.active_hint = new active_hint.ActiveHint(this.dpi);

            const focused = this.focus_window();
            if (focused) {
                this.active_hint.track(focused);
            }
        } else if (this.active_hint) {
            this.active_hint.destroy();
            this.active_hint = null;
        }
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

    /** Triggered when a window has been focused */
    on_focused(win: Window.ShellWindow) {
        this.exit_modes();
        this.prev_focused = this.last_focused;
        this.last_focused = win.entity;

        this.active_hint?.track(win);

        win.meta.raise();

        let msg = `focused Window(${win.entity}) {\n`
            + `  name: ${win.name(this)},\n`
            + `  title: ${win.meta.get_title()},\n`
            + `  rect: ${win.rect().fmt()},\n`
            + `  wm_class: "${win.meta.get_wm_class()}",\n`
            + `  monitor: ${win.meta.get_monitor()},\n`
            + `  workspace: ${win.workspace_id()},\n`
            + `  cmdline: ${win.cmdline()},\n`
            + `  xid: ${win.xid()},\n`;

        if (this.auto_tiler) {
            msg += `  fork: (${this.auto_tiler.attached.get(win.entity)}),\n`;
        }

        Log.info(msg + '}');
    }

    on_gap_inner() {
        let current = this.settings.gap_inner();
        let prev_gap = this.gap_inner_prev / 4 / this.dpi;

        Log.debug(`PREV: ${prev_gap}; Current = ${current}`);
        if (current != prev_gap) {
            this.set_gap_inner(current);
            Log.info(`inner gap changed to ${current}`);
            if (this.auto_tiler) {
                this.switch_workspace_on_move = false;
                for (const [entity,] of this.auto_tiler.forest.toplevel.values()) {
                    const fork = this.auto_tiler.forest.forks.get(entity);
                    if (fork) {
                        this.auto_tiler.tile(this, fork, fork.area);
                    }
                }
                this.switch_workspace_on_move = true;
            } else {
                this.update_snapped();
            }

            Gio.Settings.sync();
        }
    }

    on_gap_outer() {
        let current = this.settings.gap_outer();
        let prev_gap = this.gap_outer_prev / 4 / this.dpi;

        let diff = current - prev_gap;
        if (diff != 0) {
            Log.info(`outer gap changed to ${current}`);
            this.set_gap_outer(current);
            if (this.auto_tiler) {
                this.switch_workspace_on_move = false;
                for (const [entity,] of this.auto_tiler.forest.toplevel.values()) {
                    const fork = this.auto_tiler.forest.forks.get(entity);

                    if (fork) {
                        fork.area.array[0] += diff * 4;
                        fork.area.array[1] += diff * 4;
                        fork.area.array[2] -= diff * 8;
                        fork.area.array[3] -= diff * 8;

                        this.auto_tiler.tile(this, fork, fork.area);
                    }
                }
                this.switch_workspace_on_move = true;
            } else {
                this.update_snapped();
            }

            Gio.Settings.sync();
        }
    }

    on_show_window_titles() {
        for (const window of this.windows.values()) {
            if (window.meta.is_client_decorated()) continue;

            if (this.settings.show_title()) {
                window.decoration_show(this);
            } else {
                window.decoration_hide(this);
            }
        }
    }

    /** Triggered when a grab operation has been ended */
    on_grab_end(meta: Meta.Window, op: any) {
        let win = this.get_window(meta);

        if (null == win || !win.is_tilable(this)) {
            return;
        }

        this.size_signals_unblock(win);

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

    /** Triggered when a grab operation has been started */
    on_grab_start(meta: Meta.Window) {
        let win = this.get_window(meta);
        if (win && win.is_tilable(this)) {
            let entity = win.entity;
            Log.debug(`Start grab of Window(${entity}): ${this.names.get(entity)}`);
            let rect = win.rect();
            this.grab_op = new GrabOp.GrabOp(entity, rect);

            this.size_signals_block(win);
        }
    }

    /** Handle window maximization notifications */
    on_maximize(win: Window.ShellWindow) {
        if (win.is_maximized()) {
            this.on_monitor_changed(win, (cfrom, cto, workspace) => {
                if (win) {
                    Log.debug(`window ${win.name(this)} moved from display ${cfrom} to ${cto}`);
                    this.monitors.insert(win.entity, [cto, workspace]);
                    this.auto_tiler?.detach_window(this, win.entity);
                }
            });
        } else if (this.auto_tiler && this.auto_tiler.attached.contains(win.entity)) {
            this.auto_tiler.attach_to_monitor(this, win, this.workspace_id(win));
        }
    }

    /** Handles the event of a window moving from one monitor to another. */
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

    /** Handles display configuration changes */
    on_display_change() {
        this.update_display_configuration();
    }

    /** Handle window creation events */
    on_window_create(window: Meta.Window) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            let actor = window.get_compositor_private();
            if (actor) {
                this.on_window_create_inner(window, actor);
            }

            return false;
        });
    }

    on_window_create_inner(window: Meta.Window, actor: Clutter.Actor) {
        let win = this.get_window(window);
        if (win) {
            const entity = win.entity;
            actor.connect('destroy', () => {
                if (win) this.on_destroy(entity);
                return false;
            });

            if (win.is_tilable(this)) {
                this.connect_window(win);
            }
        }
    }

    /** Handle workspace change events */
    on_workspace_changed(win: Window.ShellWindow) {
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

    set_gap_inner(gap: number) {
        this.gap_inner_prev = this.gap_inner;
        this.gap_inner = gap * 4 * this.dpi;
        this.gap_inner_half = this.gap_inner / 2;
    }

    set_gap_outer(gap: number) {
        this.gap_outer_prev = this.gap_outer;
        this.gap_outer = gap * 4 * this.dpi;
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

        this.connect(this.settings.ext, 'changed', (_s, key: string) => {
            switch (key) {
                case 'active-hint':
                    this.on_active_hint();
                    break;
                case 'gap-inner':
                    this.on_gap_inner();
                    break
                case 'gap-outer':
                    this.on_gap_outer();
                    break;
                case 'show-title':
                    this.on_show_window_titles();
                    break;
            }
        });
        this.connect(this.settings.mutter, 'changed::workspaces-only-on-primary', () => this.on_display_change());

        this.connect(layoutManager, 'monitors-changed', () => this.on_display_change());

        this.connect(sessionMode, 'updated', () => {
            if ('user' != global.sessionMode.currentMode) {
                this.exit_modes();
            }
            return true;
        });

        this.connect(overview, 'showing', () => {
            Log.info(`showing overview`);
            if (this.active_hint) {
                this.active_hint.hide();
            }

            this.exit_modes();

            if (this.grab_op) {
                Log.info(`unsetting grab operation due to overview entrance`);
                let window = this.windows.get(this.grab_op.entity);
                if (window) this.size_signals_unblock(window);
                this.grab_op = null;
            }

            return true;
        });

        this.connect(overview, 'hiding', () => {
            if (this.active_hint && this.active_hint.window) {
                let window = this.active_hint.window.meta;
                if (!window.get_maximized()) {
                    this.active_hint.show();
                }
            }
        });

        // We have to connect this signal in an idle_add; otherwise work areas stop being calculated
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.update_display_configuration();

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
            Log.debug(`active workspace changed`);
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

        if (this.settings.tile_by_default() && !this.auto_tiler) {
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

        if (this.init) {
            for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
                this.on_window_create(window.meta);
            }

            GLib.timeout_add(1000, GLib.PRIORITY_DEFAULT, () => {
                this.init = false;
                Log.debug(`init complete`);
                return false;
            });
        }
    }

    signals_remove() {
        for (const [object, signals] of this.signals) {
            for (const signal of signals) {
                object.disconnect(signal);
            }
        }

        this.signals.clear();
    }

    size_signals_block(win: Window.ShellWindow) {
        this.size_signals.with(win.entity, (signals) => {
            Log.debug(`Blocking signals of Window(${win.entity})`);
            for (const signal of signals) utils.block_signal(win.meta, signal);
        });
    }

    size_signals_unblock(win: Window.ShellWindow) {
        this.size_signals.with(win.entity, (signals) => {
            Log.debug(`Unblocking signals of Window(${win.entity})`);
            for (const signal of signals) utils.unblock_signal(win.meta, signal);
        });
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

    on_display_move(_from_id: number, _to_id: number) {
        if (!this.auto_tiler) return;


    }

    on_display_remove(id: number, display: Display) {
        if (!this.auto_tiler) return;

        Log.info(`Display(${id}) removed`);

        let forest = this.auto_tiler.forest;

        for (const [entity, [mon_id,]] of forest.toplevel.values()) {
            Log.info(`Found TopLevel(${entity}, ${mon_id})`);
            if (mon_id === id) {
                let fork = forest.forks.get(entity);
                if (!fork) continue;

                Log.info(`finding new workspace`);
                const [new_work_id] = find_unused_workspace();
                Log.info('finding monitor to retach');
                const [new_mon_id, new_mon] = this.find_monitor_to_retach(display.area.width, display.area.height);

                fork.workspace = new_work_id;

                let blocked = new Array();

                for (const child of forest.iter(entity, node.NodeKind.FORK)) {
                    if (child.kind === node.NodeKind.FORK) {
                        const cfork = forest.forks.get(child.entity);
                        if (!cfork) continue;
                        cfork.workspace = new_work_id;
                    } else {
                        let window = this.windows.get(child.entity);
                        if (window) {
                            this.size_signals_block(window);
                            blocked.push(window);
                        }
                    }
                }

                fork.migrate(this, forest, new_mon.ws, new_mon_id, new_work_id);

                for (const window of blocked) {
                    this.size_signals_unblock(window);
                }
            }
        }
    }

    update_display_configuration() {
        Log.info('Updating display configuration');
        let moved = new Array();
        let updated = new Map();

        for (const monitor of layoutManager.monitors) {
            const mon = monitor as Monitor;

            const area = new Rect.Rectangle([mon.x, mon.y, mon.width, mon.height]);
            const ws = this.monitor_work_area(mon.index);

            for (const [id, display] of this.displays) {
                if (display.area.eq(area) && display.ws.eq(ws)) {
                    if (id !== mon.index) {
                        this.displays.set(mon.index, { area, ws });
                        moved.push([id, mon.index]);
                    } else {
                        updated.set(id, display);
                    }

                    this.displays.delete(id);
                }
            }

            updated.set(mon.index, { area, ws });
        }

        for (const [id, display] of this.displays) {
            this.on_display_remove(id, display);
        }

        this.displays = updated;

        for (const [from_id, to_id] of moved) {
            this.on_display_move(from_id, to_id);
        }

        for (const [id, display] of this.displays) {
            Log.info(`Display(${id}): ${display_fmt(display)}`);
        }

        Log.info(`Updated display configuration`);
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
            const actor = meta.get_compositor_private();
            if (!actor) return null;

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

            if (this.auto_tiler && win.is_tilable(this)) {
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

    /** Fetch a workspace by its index */
    workspace_by_id(id: number): Meta.Workspace | null {
        return global.display.get_workspace_manager().get_workspace_by_index(id);
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
}

// @ts-ignore
function enable() {
    Log.info("enable");

    if (!ext) {
        ext = new Ext();

        // Code to execute after the shell has finished initializing everything.
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            if (ext?.auto_tiler) ext.snap_windows();
            return false;
        });
    }

    ext.signals_attach();

    layoutManager.addChrome(ext.overlay);

    if (!indicator) {
        indicator = new PanelSettings.Indicator(ext);
        panel.addToStatusArea('pop-shell', indicator.button);
    }

    ext.keybindings.enable(ext.keybindings.global)
        .enable(ext.keybindings.window_focus);
}

// @ts-ignore
function disable() {
    Log.info("disable");

    if (ext) {
        ext.signals_remove();
        ext.exit_modes();

        layoutManager.removeChrome(ext.overlay);

        ext.keybindings.disable(ext.keybindings.global)
            .disable(ext.keybindings.window_focus)
    }
}

function find_unused_workspace(): [number, any] {
    let new_work = null;

    let id = 0;
    let ws = global.workspace_manager.get_workspace_by_index(id);

    while (ws !== null) {
        if (ws.n_windows === 0) {
            new_work = ws;
            break
        }

        id += 1;
        ws = global.workspace_manager.get_workspace_by_index(id);
    }

    if (new_work === null) {
        new_work = global.workspace_manager.append_new_workspace(true, global.get_current_time());
        id = new_work.index();
    }

    return [id, new_work];
}

let loaded_theme: any | null = null;

// Supplements the GNOME Shell theme with the extension's theme.
function load_theme(stylesheet: string) {
    try {
        Log.info(`loading theme`)
        const file = Gio.File.new_for_path(Me.path + "/" + stylesheet + ".css");

        Log.info(`setting theme`);

        const theme = THEME_CONTEXT.get_theme();
        if (loaded_theme) theme.unload_stylesheet(loaded_theme);
        theme.load_stylesheet(file);
        loaded_theme = file;

        Log.info(`theme set`);
    } catch (e) {
        Log.error("failed to load stylesheet: " + e);
    }
}
