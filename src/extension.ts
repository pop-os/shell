const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Forest from 'forest';
import * as Ecs from 'ecs';
import * as Events from 'events';
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
import * as Executor from 'executor';

import type { Entity } from 'ecs';
import type { ExtEvent } from 'events';
import type { Rectangle } from 'rectangle';
import type { Indicator } from 'panel_settings';
import type { Launcher } from './launcher';
import { Fork } from './fork';

const { Gio, Meta, St } = imports.gi;
const { GlobalEvent, WindowEvent } = Events;
const { cursor_rect, is_move_op } = Lib;
const { layoutManager, loadTheme, overview, panel, setThemeStylesheet, screenShield, sessionMode } = imports.ui.main;
const Tags = Me.imports.tags;

const STYLESHEET_PATHS = ['light', 'dark'].map(stylesheet_path);
const STYLESHEETS = STYLESHEET_PATHS.map(Gio.File.new_for_path);

enum Style { Light, Dark }

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

export class Ext extends Ecs.System<ExtEvent> {
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
    column_size: number = 32;

    /** The currently-loaded theme variant */
    current_style: Style = this.settings.is_dark_shell() ? Style.Dark : Style.Light;

    /** Row size in snap-to-grid */
    row_size: number = 32;

    /** The known display configuration, for tracking monitor removals and changes */
    displays: Map<number, Display> = new Map();

    /** The current scaling factor in GNOME Shell */
    dpi: number = St.ThemeContext.get_for_stage(global.stage).scale_factor;

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

    /** A display config update is triggered on a workspace addition */
    ignore_display_update: boolean = false;

    /** The last window that was focused */
    last_focused: Entity | null = null;

    /** The window that was focused before the last window */
    prev_focused: Entity | null = null;

    tween_signals: Map<string, [SignalID, any]> = new Map();

    /** Initially set to true when the extension is initializing */
    init: boolean = true;

    /** Record of misc. global objects and their attached signals */
    private signals: Map<GObject.Object, Array<SignalID>> = new Map();


    // Entity-component associations

    /** Store for stable sequences of each registered window */
    ids: Ecs.Storage<number> = this.register_storage();

    /** Store for keeping track of which monitor + workspace a window is on */
    monitors: Ecs.Storage<[number, number]> = this.register_storage();

    /** Store for names associated with windows */
    names: Ecs.Storage<string> = this.register_storage();

    /** Signal ID which handles size-changed signals */
    size_changed_signal: SignalID = 0;

    /** Store for size-changed signals attached to each window */
    size_signals: Ecs.Storage<SignalID[]> = this.register_storage();

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
        super(new Executor.GLibExecutor());

        this.load_settings();

        this.register_fn(() => load_theme(this.current_style));

        if (this.settings.int) {
            this.settings.int.connect('changed::gtk-theme', () => {
                this.register(Events.global(GlobalEvent.GtkThemeChanged));
            });
        }

        if (this.settings.shell) {
            this.settings.shell.connect('changed::name', () => {
                this.register(Events.global(GlobalEvent.GtkShellChanged));
            });
        }
    }

    // System interface

    /** Registers a generic callback to be executed in the event loop. */
    register_fn(callback: () => void, name?: string) {
        this.register({ tag: 1, callback, name });
    }

    /** Executes an event on the system */
    run(event: ExtEvent) {
        switch (event.tag) {
            /** Callback Event */
            case 1:
                (event.callback)();
                break

            /** Window Event */
            case 2:
                let win = event.window;

                /** Validate that the window's actor still exists. */
                if (!win.actor_exists()) return;

                if (event.kind.tag === 1) {
                    let actor = event.window.meta.get_compositor_private();
                    if (!actor) {
                        this.auto_tiler?.detach_window(this, event.window.entity);
                        return;
                    }

                    event.window.meta.move_resize_frame(
                        true,
                        event.kind.rect.x,
                        event.kind.rect.y,
                        event.kind.rect.width,
                        event.kind.rect.height
                    );

                    return;
                }

                switch (event.kind.event) {
                    case WindowEvent.Maximize:
                        this.on_maximize(win);
                        break

                    case WindowEvent.Minimize:
                        this.on_minimize(win);
                        break;

                    case WindowEvent.Size:
                        if (this.auto_tiler && !win.is_maximized() && !win.meta.is_fullscreen()) {
                            this.auto_tiler.reflow(this, win.entity);
                        }

                        break

                    case WindowEvent.Workspace:
                        this.on_workspace_changed(win)
                        break

                    case WindowEvent.Fullscreen:
                        if (this.auto_tiler) {
                            let attachment = this.auto_tiler.attached.get(win.entity);
                            if (attachment) {
                                if (!win.meta.is_fullscreen()) {
                                    let fork = this.auto_tiler.forest.forks.get(win.entity);
                                    if (fork) {
                                        this.auto_tiler.reflow(this, win.entity);
                                    }

                                    if (this.active_hint?.is_tracking(win.entity)) {
                                        this.active_hint.show();
                                    }
                                } else if (win.is_maximized()) {
                                    this.size_changed_block();
                                    win.meta.unmaximize(Meta.MaximizeFlags.BOTH);
                                    win.meta.make_fullscreen();
                                    this.size_changed_unblock();
                                }
                            }
                        }

                        break
                }

                break

            /** Window Create Event */
            case 3:
                let actor = event.window.get_compositor_private();
                if (!actor) return;

                this.on_window_create(event.window, actor);
                break

            /** Stateless global events */
            case 4:
                switch (event.event) {
                    case GlobalEvent.GtkShellChanged:
                        this.on_gtk_shell_changed();
                        break;

                    case GlobalEvent.GtkThemeChanged:
                        this.on_gtk_theme_change();
                        break;

                    case GlobalEvent.MonitorsChanged:
                        this.update_display_configuration(false);
                        break;

                    case GlobalEvent.OverviewShown:
                        this.on_overview_shown();
                        break;

                    case GlobalEvent.OverviewHidden:
                        this.on_overview_hidden();
                        break;
                }

                break
        }
    }

    // Extension methods

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
    connect(object: GObject.Object, property: string, callback: (...args: any) => boolean | void): SignalID {
        const signal = object.connect(property, callback);
        const entry = this.signals.get(object);
        if (entry) {
            entry.push(signal);
        } else {
            this.signals.set(object, [signal]);
        }

        return signal;
    }

    connect_meta(win: Window.ShellWindow, signal: string, callback: (...args: any[]) => void): number {
        return win.meta.connect(signal, () => {
            if (win.actor_exists()) callback();
        });
    }

    connect_window(win: Window.ShellWindow) {
        this.size_signals.insert(win.entity, [
            this.connect_meta(win, 'size-changed', () => {
                this.register(Events.window_event(win, WindowEvent.Size));
            }),
            this.connect_meta(win, 'position-changed', () => {
                this.register(Events.window_event(win, WindowEvent.Size));
            }),
            this.connect_meta(win, 'workspace-changed', () => {
                this.register(Events.window_event(win, WindowEvent.Workspace));
            }),
            this.connect_meta(win, 'notify::minimized', () => {
                this.register(Events.window_event(win, WindowEvent.Minimize));
            }),
        ]);
    }

    exit_modes() {
        this.tiler.exit(this);
        this.window_search.close();
        this.overlay.visible = false;
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

        this.column_size = this.settings.column_size() * this.dpi;
        this.row_size = this.settings.row_size() * this.dpi;

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

    on_active_workspace_changed() {
        const refocus_hint = () => {
            if (!this.active_hint?.window) return

            let active = this.windows.get(this.active_hint.window.entity);
            if (!active) return;

            let aws = this.workspace_id(active);
            let cws = this.workspace_id(null);

            if (aws[0] === cws[0] && aws[1] === cws[1]) {
                this.active_hint.show();
            } else {
                this.active_hint.hide();
            }
        };

        refocus_hint();
        this.exit_modes();
        this.last_focused = null;
    }

    on_destroy(win: Entity) {
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

        this.windows.remove(win)
        this.delete_entity(win);
    }

    on_display_move(_from_id: number, _to_id: number) {
        if (!this.auto_tiler) return;
    }

    on_display_remove(id: number, display: Display) {
        if (!this.auto_tiler) return;

        Log.info(`Display(${id}) removed`);

        let forest = this.auto_tiler.forest;
        let blocked = new Array();

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
            }
        }

        for (const window of blocked) {
            this.size_signals_unblock(window);
        }
    }

    /** Triggered when a window has been focused */
    on_focused(win: Window.ShellWindow) {
        this.exit_modes();

        this.size_signals_unblock(win);

        this.prev_focused = this.last_focused;
        this.last_focused = win.entity;

        this.active_hint?.track(win);

        win.meta.raise();

        if (this.auto_tiler && this.prev_focused !== null && win.is_tilable(this)) {
            let prev = this.windows.get(this.prev_focused);
            let is_attached = this.auto_tiler.attached.contains(this.prev_focused);

            if (prev && is_attached && prev.actor_exists() && prev.rect().contains(win.rect())) {
                if (prev.is_maximized()) {
                    prev.meta.unmaximize(Meta.MaximizeFlags.BOTH);
                }

                if (prev.meta.is_fullscreen()) {
                    prev.meta.unmake_fullscreen();
                }
            }
        }

        // let msg = `focused Window(${win.entity}) {\n`
        //     + `  name: ${win.name(this)},\n`
        //     + `  rect: ${win.rect().fmt()},\n`
        //     + `  wm_class: "${win.meta.get_wm_class()}",\n`
        //     + `  monitor: ${win.meta.get_monitor()},\n`
        //     + `  workspace: ${win.workspace_id()},\n`
        //     + `  cmdline: ${win.cmdline()},\n`
        //     + `  xid: ${win.xid()},\n`;

        // if (this.auto_tiler) {
        //     msg += `  fork: (${this.auto_tiler.attached.get(win.entity)}),\n`;
        // }

        // Log.info(msg + '}');
    }

    on_gap_inner() {
        let current = this.settings.gap_inner();
        this.set_gap_inner(current);
        let prev_gap = this.gap_inner_prev / 4 / this.dpi;

        if (current != prev_gap) {
            Log.info(`inner gap changed to ${current}`);
            if (this.auto_tiler) {
                for (const [entity,] of this.auto_tiler.forest.toplevel.values()) {
                    const fork = this.auto_tiler.forest.forks.get(entity);
                    if (fork) {
                        this.auto_tiler.tile(this, fork, fork.area);
                    }
                }
            } else {
                this.update_snapped();
            }

            Gio.Settings.sync();
        }
    }

    on_gap_outer() {
        let current = this.settings.gap_outer();
        this.set_gap_outer(current);

        let prev_gap = this.gap_outer_prev / 4 / this.dpi;
        let diff = current - prev_gap;

        if (diff != 0) {
            this.set_gap_outer(current);
            if (this.auto_tiler) {
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
            } else {
                this.update_snapped();
            }

            Gio.Settings.sync();
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
            if (this.auto_tiler) {
                let crect = win.rect()
                const rect = this.grab_op.rect;
                if (is_move_op(op)) {
                    this.on_monitor_changed(win, (_changed_from, changed_to, workspace) => {
                        if (win) {
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
                            let top_level = this.auto_tiler.forest.find_toplevel(this.workspace_id());
                            if (top_level) {
                                crect.clamp((this.auto_tiler.forest.forks.get(top_level) as Fork).area);
                            }

                            const movement = this.grab_op.operation(crect);

                            this.auto_tiler.forest.resize(this, fork, component, win.entity, movement, crect);
                            this.auto_tiler.forest.arrange(this, component.workspace);
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
            let rect = win.rect();

            this.unset_grab_op();

            this.grab_op = new GrabOp.GrabOp(entity, rect);

            this.size_signals_block(win);
        }
    }

    on_gtk_shell_changed() {
        load_theme(this.settings.is_dark_shell() ? Style.Dark : Style.Light);
    }

    on_gtk_theme_change() {
        load_theme(this.settings.is_dark_shell() ? Style.Dark : Style.Light);
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

    /** Handle window maximization notifications */
    on_maximize(win: Window.ShellWindow) {
        if (win.is_maximized()) {
            if (win.meta.is_fullscreen()) {
                this.size_changed_block();
                win.meta.unmake_fullscreen();
                win.meta.maximize(Meta.MaximizeFlags.BOTH);
                this.size_changed_unblock();
            }

            this.on_monitor_changed(win, (_cfrom, cto, workspace) => {
                if (win) {
                    this.monitors.insert(win.entity, [cto, workspace]);
                    this.auto_tiler?.detach_window(this, win.entity);
                }
            });
        } else if (this.auto_tiler) {
            let fork_ent = this.auto_tiler.attached.get(win.entity);
            if (fork_ent) {
                let fork = this.auto_tiler.forest.forks.get(fork_ent);
                if (fork) this.auto_tiler.tile(this, fork, fork.area);
            }

            if (this.active_hint?.is_tracking(win.entity)) {
                this.active_hint.show();
            }
        }
    }

    /** Handle window minimization notifications */
    on_minimize(win: Window.ShellWindow) {
        if (this.auto_tiler) {
            if (win.meta.minimized) {
                if (this.active_hint && this.active_hint.is_tracking(win.entity)) {
                    this.active_hint.untrack();
                }

                const attached = this.auto_tiler.attached.get(win.entity)
                if (!attached) return;

                const fork = this.auto_tiler.forest.forks.get(attached);
                if (!fork) return;

                win.was_attached_to = [attached, fork.left.is_window(win.entity)];
                this.auto_tiler.detach_window(this, win.entity);
            } else if (!this.contains_tag(win.entity, Tags.Floating)) {
                if (win.was_attached_to) {
                    const [entity, is_left] = win.was_attached_to;
                    delete win.was_attached_to;

                    const tiler = this.auto_tiler;

                    const fork = tiler.forest.forks.get(entity);
                    if (fork) {
                        tiler.forest.attach_fork(this, fork, win.entity, is_left);
                        tiler.tile(this, fork, fork.area);
                        return
                    }
                } else {
                    this.auto_tiler.auto_tile(this, win, false);
                }
            }
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

    on_overview_hidden() {
        if (this.active_hint && this.active_hint.window) {
            let window = this.active_hint.window.meta;
            if (!window.get_maximized()) {
                this.active_hint.show();
            }
        }
    }

    on_overview_shown() {
        if (this.active_hint) {
            this.active_hint.hide();
        }

        this.exit_modes();
        this.unset_grab_op();
    }

    on_window_create(window: Meta.Window, actor: Clutter.Actor) {
        let win = this.get_window(window);
        if (win) {
            const entity = win.entity;
            actor.connect('destroy', () => {
                this.on_destroy(entity);
                return false;
            });

            if (win.is_tilable(this)) {
                this.connect_window(win);
            } else {
                window.raise();
                window.unminimize();
                window.activate(global.get_current_time());
            }
        }
    }

    on_workspace_added(_number: number) {
        this.ignore_display_update = true;
    }

    /** Handle workspace change events */
    on_workspace_changed(win: Window.ShellWindow) {
        if (this.auto_tiler && !this.contains_tag(win.entity, Tags.Floating)) {
            const id = this.workspace_id(win);
            const prev_id = this.monitors.get(win.entity);
            if (!prev_id || id[0] != prev_id[0] || id[1] != prev_id[1]) {
                this.monitors.insert(win.entity, id);
                this.auto_tiler.detach_window(this, win.entity);
                this.auto_tiler.attach_to_workspace(this, win, id);
            }

            if (win.meta.minimized) {
                this.size_signals_block(win);
                win.meta.unminimize();
                this.size_signals_unblock(win);
            }
        }
    }

    on_workspace_index_changed(prev: number, next: number) {
        this.on_workspace_modify(
            (current) => current == prev,
            (_) => next
        );
    }

    on_workspace_modify(
        condition: (current: number) => boolean,
        modify: (current: number) => number
    ) {
        if (this.auto_tiler) {
            let detach = new Array();

            for (const [entity, monitor] of this.auto_tiler.forest.toplevel.values()) {
                if (condition(monitor[1])) {
                    Log.info(`moving tree from Fork(${entity})`);

                    const value = modify(monitor[1]);
                    monitor[1] = value;
                    let fork = this.auto_tiler.forest.forks.get(entity);
                    if (fork) {
                        fork.workspace = value;
                        for (const child of this.auto_tiler.forest.iter(entity)) {
                            if (child.kind === node.NodeKind.FORK) {
                                fork = this.auto_tiler.forest.forks.get(child.entity);
                                if (fork) fork.workspace = value;
                            } else if (child.kind === node.NodeKind.WINDOW) {
                                const window = this.windows.get(child.entity);
                                if (window) {
                                    const win_monitor = this.monitors.get(child.entity);
                                    if (win_monitor) {
                                        win_monitor[1] = value;
                                    }

                                    if (window.actor_exists()) continue;
                                }

                                detach.push(child.entity);
                            }
                        }
                    }
                }
            }

            for (const child of detach) {
                this.auto_tiler.detach_window(this, child);
            }
        }
    }

    on_workspace_removed(number: number) {
        Log.info(`workspace ${number} was removed`);
        this.on_workspace_modify(
            (current) => current > number,
            (prev) => prev - 1
        );
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

        let idx = 0;
        let ws = workspace_manager.get_workspace_by_index(idx);
        while (ws !== null) {
            idx += 1;
            let index = ws.index();

            this.connect(ws, 'notify::workspace-index', () => {
                if (ws !== null) {
                    let new_index = ws.index();
                    this.on_workspace_index_changed(index, new_index);
                    index = new_index;
                }
            });

            ws = workspace_manager.get_workspace_by_index(idx);
        }

        this.connect(global.display, 'workareas-changed', () => {
            this.update_display_configuration(true);
        });

        this.size_changed_signal = this.connect(global.window_manager, 'size-change', (_, actor, event, _before, _after) => {
            if (this.auto_tiler) {
                let win = this.get_window(actor.get_meta_window());
                if (!win) return;

                if (event === Meta.SizeChange.MAXIMIZE || event === Meta.SizeChange.UNMAXIMIZE) {
                    this.register(Events.window_event(win, WindowEvent.Maximize));
                } else {
                    this.register(Events.window_event(win, WindowEvent.Fullscreen));
                }
            }
        });

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

        if (this.settings.mutter) {
            this.connect(this.settings.mutter, 'changed::workspaces-only-on-primary', () => {
                this.register(Events.global(GlobalEvent.MonitorsChanged));
            });
        }

        this.connect(layoutManager, 'monitors-changed', () => {
            this.register(Events.global(GlobalEvent.MonitorsChanged));
        });

        this.connect(sessionMode, 'updated', () => {
            if ('user' != global.sessionMode.currentMode) this.exit_modes();
        });

        this.connect(overview, 'showing', () => {
            this.register(Events.global(GlobalEvent.OverviewShown));
        });

        this.connect(overview, 'hiding', () => {
            this.register(Events.global(GlobalEvent.OverviewHidden));
        });

        // We have to connect this signal in an idle_add; otherwise work areas stop being calculated
        this.register_fn(() => {
            if (screenShield?.locked) this.update_display_configuration(false);

            this.connect(global.display, 'notify::focus-window', () => {
                const window = this.focus_window();
                if (window) this.on_focused(window);
            });

            const window = this.focus_window();
            if (window) {
                this.on_focused(window);
            }

            return false;
        });

        this.connect(global.display, 'window_created', (_, window: Meta.Window) => {
            this.register({ tag: 3, window });
        });

        this.connect(global.display, 'grab-op-begin', (_, _display, win) => {
            this.on_grab_start(win);
        });

        this.connect(global.display, 'grab-op-end', (_, _display, win, op) => {
            this.on_grab_end(win, op);
        });

        this.connect(workspace_manager, 'active-workspace-changed', () => {
            this.on_active_workspace_changed();
        });

        this.connect(workspace_manager, 'workspace-removed', (_, number) => {
            this.on_workspace_removed(number);
        });

        this.connect(workspace_manager, 'workspace-added', (_, number) => {
            this.on_workspace_added(number);
        });

        // Modes

        if (this.settings.tile_by_default() && !this.auto_tiler) {
            Log.info(`tile by default enabled`);

            this.auto_tiler = new auto_tiler.AutoTiler(
                new Forest.Forest()
                    .connect_on_attach((entity: Entity, window: Entity) => {
                        if (this.auto_tiler) {
                            this.auto_tiler.attached.insert(window, entity);
                        }
                    }),
                this.register_storage<Entity>(),
            )
        }

        // Post-init

        if (this.init) {
            for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
                this.register({ tag: 3, window: window.meta });
            }

            this.register_fn(() => this.init = false);
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

    size_changed_block() {
        utils.block_signal(global.window_manager, this.size_changed_signal);
    }

    size_changed_unblock() {
        utils.unblock_signal(global.window_manager, this.size_changed_signal);
    }

    size_signals_block(win: Window.ShellWindow) {
        this.size_signals.with(win.entity, (signals) => {
            for (const signal of signals) {
                utils.block_signal(win.meta, signal);
            }
            this.add_tag(win.entity, Tags.Blocked);
        });
    }

    size_signals_unblock(win: Window.ShellWindow) {
        // if (!this.contains_tag(win.entity, Tags.Blocked)) return;

        this.size_signals.with(win.entity, (signals) => {
            for (const signal of signals) {
                utils.unblock_signal(win.meta, signal);
            };
            this.delete_tag(win.entity, Tags.Blocked);
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

    unset_grab_op() {
        if (this.grab_op !== null) {
            let window = this.windows.get(this.grab_op.entity);
            if (window) this.size_signals_unblock(window);
            this.grab_op = null;
        }
    }

    update_display_configuration(workareas_only: boolean) {
        if (!this.auto_tiler) return;

        if (this.ignore_display_update) {
            this.ignore_display_update = false;
            return;
        }

        let moved = new Array();
        let updated = new Map();

        if (workareas_only) {
            this.displays.clear();
        }

        for (const monitor of layoutManager.monitors) {
            const mon = monitor as Monitor;

            const area = new Rect.Rectangle([mon.x, mon.y, mon.width, mon.height]);
            const ws = this.monitor_work_area(mon.index);

            if (!workareas_only) {
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
            }

            updated.set(mon.index, { area, ws });
        }

        if (!workareas_only) for (const [id, display] of this.displays) {
            this.on_display_remove(id, display);
        }

        this.displays = updated;

        for (const [from_id, to_id] of moved) {
            this.on_display_move(from_id, to_id);
        }

        for (const [id, display] of this.displays) {
            Log.info(`Display(${id}): ${display_fmt(display)}`);
        }

        for (const [entity, [mon_id,]] of this.auto_tiler.forest.toplevel.values()) {
            let fork = this.auto_tiler.forest.forks.get(entity);
            let display = this.displays.get(mon_id);

            if (fork && display) {
                this.auto_tiler.update_toplevel(this, fork, mon_id);
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

            this.ids.insert(entity, id);
            this.names.insert(entity, name);

            let win = new Window.ShellWindow(entity, meta, window_app, this);

            this.windows.insert(entity, win);
            this.monitors.insert(entity, [win.meta.get_monitor(), win.workspace_id()]);

            if (this.auto_tiler && !win.meta.minimized && win.is_tilable(this)) {
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

        let id: [number, number] = window
            ? [window.meta.get_monitor(), window.workspace_id()]
            : [this.active_monitor(), this.active_workspace()];


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

        ext.register_fn(() => {
            if (ext?.auto_tiler) ext.snap_windows();
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

function stylesheet_path(name: string) { return Me.path + "/" + name + ".css"; }

// Supplements the loaded theme with the extension's theme.
function load_theme(style: Style): string | any {
    let pop_stylesheet = Number(style)
    try {
        const theme_context = St.ThemeContext.get_for_stage(global.stage);

        const existing_theme: null | any = theme_context.get_theme();

        const pop_stylesheet_path = STYLESHEET_PATHS[pop_stylesheet];

        if (existing_theme) {
            /* Must unload stylesheets, or else the previously loaded
             * stylesheets will persist when loadTheme() is called
             * (found in source code of imports.ui.main).
             */
            for (const s of STYLESHEETS) {
                existing_theme.unload_stylesheet(s);
            }

            // Merge theme update with pop shell styling
            existing_theme.load_stylesheet(STYLESHEETS[pop_stylesheet]);

            // Perform theme update
            theme_context.set_theme(existing_theme);
        } else {
            // User does not have a theme loaded, so use pop styling + default
            setThemeStylesheet(pop_stylesheet_path);
            loadTheme();
        }

        return pop_stylesheet_path;
    } catch (e) {
        Log.error("failed to load stylesheet: " + e);
        return null;
    }
}
