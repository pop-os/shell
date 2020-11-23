const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Config from 'config';
import * as Forest from 'forest';
import * as Ecs from 'ecs';
import * as Events from 'events';
import * as Focus from 'focus';
import * as GrabOp from 'grab_op';
import * as Keybindings from 'keybindings';
import * as Lib from 'lib';
import * as log from 'log';
import * as PanelSettings from 'panel_settings';
import * as Rect from 'rectangle';
import * as Settings from 'settings';
import * as Tiling from 'tiling';
import * as Window from 'window';
import * as launcher from 'dialog_launcher';
import * as auto_tiler from 'auto_tiler';
import * as node from 'node';
import * as utils from 'utils';
import * as Executor from 'executor';
import * as movement from 'movement';
import * as stack from 'stack';
import * as add_exception from 'dialog_add_exception';

import type { Entity } from 'ecs';
import type { ExtEvent } from 'events';
import type { Rectangle } from 'rectangle';
import type { Indicator } from 'panel_settings';
import type { Launcher } from './dialog_launcher';
import { Fork } from './fork';

const display = global.display;
const wim = global.window_manager;
const wom = global.workspace_manager;

const Movement = movement.Movement;

const GLib: GLib = imports.gi.GLib;

const { Gio, Meta, St } = imports.gi;
const { GlobalEvent, WindowEvent } = Events;
const { cursor_rect, is_move_op } = Lib;
const { layoutManager, loadTheme, overview, panel, setThemeStylesheet, screenShield, sessionMode } = imports.ui.main;
const Tags = Me.imports.tags;

const STYLESHEET_PATHS = ['light', 'dark'].map(stylesheet_path);
const STYLESHEETS = STYLESHEET_PATHS.map((path) => Gio.File.new_for_path(path));

enum Style { Light, Dark }

interface Display {
    area: Rectangle;
    ws: Rectangle;
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

    /** An overlay which shows a preview of where a window will be moved */
    overlay: St.Widget = new St.BoxLayout({ style_class: "pop-shell-overlay", visible: false });

    /** The application launcher, focus search, and calculator dialog */
    window_search: Launcher = new launcher.Launcher(this);


    // State

    /** Animate window movements */
    animate_windows: boolean = true;

    button: any = null;
    button_gio_icon_auto_on: any = null;
    button_gio_icon_auto_off: any = null;

    conf: Config.Config = new Config.Config();

    conf_watch: null | [any, SignalID] = null;

    /** Column sizes in snap-to-grid */
    column_size: number = 32;

    /** The currently-loaded theme variant */
    current_style: Style = this.settings.is_dark_shell() ? Style.Dark : Style.Light;

    /** Set when the display configuration has been triggered for execution */
    displays_updating: SignalID | null = null;

    /** Row size in snap-to-grid */
    row_size: number = 32;

    /** The known display configuration, for tracking monitor removals and changes */
    displays: Map<number, Display> = new Map();

    /** The current scaling factor in GNOME Shell */
    dpi: number = St.ThemeContext.get_for_stage(global.stage).scale_factor;

    /** If set, the user is currently selecting a window to add to floating exceptions */
    exception_selecting: boolean = false;

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

    tiling_toggle_switch: any = null;  /** reference to the PopupSwitchMenuItem menu item, so state can be toggled */

    /** Initially set to true when the extension is initializing */
    init: boolean = true;

    was_locked: boolean = false;

    /** Record of misc. global objects and their attached signals */
    private signals: Map<GObject.Object, Array<SignalID>> = new Map();

    private size_requests: Map<GObject.Object, SignalID> = new Map();

    /** Used to debounce on_focus triggers */
    private focus_trigger: null | SignalID = null;

    // Entity-component associations

    /** Store for stable sequences of each registered window */
    ids: Ecs.Storage<number> = this.register_storage();

    /** Store for keeping track of which monitor + workspace a window is on */
    monitors: Ecs.Storage<[number, number]> = this.register_storage();

    /** Stores movements that have been queued */
    movements: Ecs.Storage<Rectangular> = this.register_storage();

    /** Store for names associated with windows */
    names: Ecs.Storage<string> = this.register_storage();

    /** Signal ID which handles size-changed signals */
    size_changed_signal: SignalID = 0;

    /** Store for size-changed signals attached to each window */
    size_signals: Ecs.Storage<SignalID[]> = this.register_storage();

    /** Set to true if a window is snapped to the grid */
    snapped: Ecs.Storage<boolean> = this.register_storage();

    /** Primary storage for the window entities, containing the actual window */
    windows: Ecs.Storage<Window.ShellWindow> = this.register_storage();

    /** Signals which have been registered for each window */
    window_signals: Ecs.Storage<Array<SignalID>> = this.register_storage();

    // Systems

    /** Manages automatic tiling behaviors in the shell */
    auto_tiler: auto_tiler.AutoTiler | null = null;

    /** Performs focus selections */
    focus_selector: Focus.FocusSelector = new Focus.FocusSelector();

    /** Calculates window placements when tiling and focus-switching */
    tiler: Tiling.Tiler = new Tiling.Tiler(this);

    tiler_active: boolean = false;

    tiler_queue: null | SignalID = null;

    constructor() {
        super(new Executor.GLibExecutor());

        this.load_settings();

        this.register_fn(() => load_theme(this.current_style));

        this.conf.reload();

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
                    const { window } = event;

                    let movement = this.movements.remove(window.entity);
                    if (!movement) return;

                    let actor = window.meta.get_compositor_private();
                    if (!actor) {
                        this.auto_tiler?.detach_window(this, window.entity);
                        return;
                    }

                    actor.remove_all_transitions();
                    const { x, y, width, height } = movement;

                    window.meta.move_resize_frame(true, x, y, width, height);
                    window.meta.move_frame(true, x, y)

                    this.monitors.insert(window.entity, [
                        win.meta.get_monitor(),
                        win.workspace_id()
                    ]);

                    if (win.activate_after_move) {
                        win.activate_after_move = false;
                        win.activate();
                    }

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
                                    if (win.stack !== null) {
                                        let stack = this.auto_tiler.forest.stacks.get(win.stack);
                                        if (stack) {
                                            stack.set_visible(true);
                                        }
                                    }
                                } else { // not full screened
                                    if (win.stack !== null) {
                                        let stack = this.auto_tiler.forest.stacks.get(win.stack);
                                        if (stack) {
                                            stack.set_visible(false);
                                        }
                                    }
                                }

                                if (win.is_maximized()) {
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
        return display.get_current_monitor();
    }

    active_window_list(): Array<Window.ShellWindow> {
        let workspace = wom.get_active_workspace();
        return this.tab_list(Meta.TabList.NORMAL, workspace);
    }

    active_workspace(): number {
        return wom.get_active_workspace_index();
    }

    actor_of(entity: Entity): null | Clutter.Actor {
        const window = this.windows.get(entity);
        return window ? window.meta.get_compositor_private() : null;
    }

    attach_config(): [any, SignalID] {
        const monitor = this.conf_watch = Gio.File.new_for_path(Config.CONF_FILE)
            .monitor(Gio.FileMonitorFlags.NONE, null);

        return [monitor, monitor.connect('changed', () => {
            this.conf.reload()

            // If the auto-tilable status of a window has changed, detach or attach the window.
            if (this.auto_tiler) {
                const at = this.auto_tiler;
                for (const [entity, window] of this.windows.iter()) {
                    const attachment = at.attached.get(entity);
                    if (window.is_tilable(this)) {
                        if (!attachment) {
                            at.auto_tile(this, window, this.init);
                        }
                    } else if (attachment) {
                        at.detach_window(this, entity)
                    }
                }
            }
        })];
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
        const id = win.meta.connect(signal, () => {
            if (win.actor_exists()) callback();
        });

        this.window_signals.get_or(win.entity, () => new Array()).push(id);

        return id;
    }

    connect_size_signal(win: Window.ShellWindow, signal: string, func: () => void): number {
        return this.connect_meta(win, signal, () => {
            if (!this.contains_tag(win.entity, Tags.Blocked)) func();
        });
    }

    connect_window(win: Window.ShellWindow) {
        const size_event = () => {
            const old = this.size_requests.get(win.meta)

            if (old) {
                try { GLib.source_remove(old) } catch (_) { }
            }

            const new_s = GLib.timeout_add(GLib.PRIORITY_LOW, 500, () => {
                this.register(Events.window_event(win, WindowEvent.Size));
                this.size_requests.delete(win.meta)
                return false
            })

            this.size_requests.set(win.meta, new_s)
        }

        this.connect_meta(win, 'workspace-changed', () => {
            this.register(Events.window_event(win, WindowEvent.Workspace));
        })

        this.size_signals.insert(win.entity, [
            this.connect_size_signal(win, 'size-changed', size_event),

            this.connect_size_signal(win, 'position-changed', size_event),

            this.connect_size_signal(win, 'notify::minimized', () => {
                this.register(Events.window_event(win, WindowEvent.Minimize));
            }),
        ]);
    }

    exception_add(win: Window.ShellWindow) {
        this.exception_selecting = false;
        let d = new add_exception.AddExceptionDialog(
            // Cancel
            () => this.exception_dialog(),
            // this_app
            () => {
                let wmclass = win.meta.get_wm_class();
                if (wmclass) this.conf.add_app_exception(wmclass);
                this.exception_dialog()
            },
            // current-window
            () => {
                let wmclass = win.meta.get_wm_class();
                if (wmclass) this.conf.add_window_exception(
                    wmclass,
                    win.meta.get_title()
                );
                this.exception_dialog()
            }
        );
        d.open();
    }

    exception_dialog() {
        let path = Me.dir.get_path() + "/floating_exceptions/main.js";

        utils.async_process(["gjs", path], null, null)
            .then(output => {
                log.debug(`Floating Window Dialog Event: ${output}`)
                switch (output.trim()) {
                    case "SELECT":
                        this.register_fn(() => this.exception_select())
                }
            })
            .catch(error => {
                log.error(`floating window process error: ${error}`)
            })
    }

    exception_select() {
        log.debug('select a window plz')
        overview.show()
        this.exception_selecting = true;
    }

    exit_modes() {
        this.tiler.exit(this);
        this.window_search.reset();
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

        const primary = display.get_primary_monitor();
        return [primary, this.displays.get(primary) as Display];
    }

    find_unused_workspace(monitor: number): [number, any] {
        if (!this.auto_tiler) return [0, wom.get_workspace_by_index(0)]

        let id = 0

        for (const fork of this.auto_tiler.forest.forks.values()) {
            if (fork.monitor === monitor && id < fork.workspace) id = fork.workspace
        }

        id += 1
        let new_work

        if (id === wom.get_n_workspaces()) {
            new_work = wom.append_new_workspace(true, global.get_current_time())
        } else {
            new_work = wom.get_workspace_by_index(id)
        }

        return [id, new_work];
    }

    focus_window(): Window.ShellWindow | null {
        let focused = this.get_window(display.get_focus_window())
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
    }

    monitor_work_area(monitor: number): Rectangle {
        const meta = display.get_workspace_manager()
            .get_active_workspace()
            .get_work_area_for_monitor(monitor);

        return Rect.Rectangle.from_meta(meta as Rectangular);
    }

    on_active_workspace_changed() {
        this.exit_modes();
        this.last_focused = null;
        this.restack()
    }

    on_destroy(win: Entity) {
        const window = this.windows.get(win);
        if (!window) return;

        // Disconnect all signals on this window
        this.window_signals.take_with(win, (signals) => {
            for (const signal of signals) {
                window.meta.disconnect(signal);
            }
        });

        if (this.last_focused == win) {
            this.last_focused = null;

            if (this.auto_tiler) {
                const entity = this.auto_tiler.attached.get(win);
                if (entity) {
                    const fork = this.auto_tiler.forest.forks.get(entity);
                    if (fork?.right?.is_window(win)) {
                        const entity = fork.right.inner.kind === 3
                            ? fork.right.inner.entities[0]
                            : fork.right.inner.entity;

                        this.windows.with(entity, (sibling) => sibling.activate())
                    }
                }
            }
        }

        const str = String(win);
        let value = this.tween_signals.get(str);
        if (value) {
            utils.source_remove(value[0]);
            this.tween_signals.delete(str);
        }

        if (this.auto_tiler) this.auto_tiler.detach_window(this, win);

        this.movements.remove(win)
        this.windows.remove(win)
        this.delete_entity(win);
    }

    on_display_move(_from_id: number, _to_id: number) {
        if (!this.auto_tiler) return;
    }

    /** Triggered when a window has been focused */
    on_focused(win: Window.ShellWindow) {
        this.exit_modes();
        this.size_signals_unblock(win);

        if (this.exception_selecting) {
            this.exception_add(win);
        }

        // Keep the last-focused window from being shifted too quickly. 300ms debounce
        if (this.focus_trigger === null) {
            this.focus_trigger = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                this.focus_trigger = null;
                return false;
            });

            this.prev_focused = this.last_focused;
            this.last_focused = win.entity;
        }

        function activate_in_stack(ext: Ext, stack: node.NodeStack, win: Window.ShellWindow) {
            ext.auto_tiler?.forest.stacks.get(stack.idx)?.activate(win.entity);
        }

        if (this.auto_tiler) {
            win.meta.raise();

            // Update the active tab in the stack.
            const attached = this.auto_tiler.attached.get(win.entity);
            if (attached) {
                const fork = this.auto_tiler.forest.forks.get(attached);
                if (fork) {
                    if (fork.left.is_in_stack(win.entity)) {
                        activate_in_stack(this, (fork.left.inner as node.NodeStack), win);
                    } else if (fork.right?.is_in_stack(win.entity)) {
                        activate_in_stack(this, (fork.right.inner as node.NodeStack), win);
                    }
                }
            }
        }

        this.show_border_on_focused();

        if (this.auto_tiler && this.prev_focused !== null && win.is_tilable(this)) {
            let prev = this.windows.get(this.prev_focused);
            let is_attached = this.auto_tiler.attached.contains(this.prev_focused);

            if (prev && prev !== win && is_attached && prev.actor_exists() && prev.rect().contains(win.rect())) {
                if (prev.is_maximized()) {
                    prev.meta.unmaximize(Meta.MaximizeFlags.BOTH);
                }

                if (prev.meta.is_fullscreen()) {
                    prev.meta.unmake_fullscreen();
                }
            }
        }

        if (this.conf.log_on_focus) {
            let msg = `focused Window(${win.entity}) {\n`
                + `  class: "${win.meta.get_wm_class()}",\n`
                + `  cmdline: ${win.cmdline()},\n`
                + `  monitor: ${win.meta.get_monitor()},\n`
                + `  name: ${win.name(this)},\n`
                + `  rect: ${win.rect().fmt()},\n`
                + `  workspace: ${win.workspace_id()},\n`
                + `  xid: ${win.xid()},\n`
                + `  stack: ${win.stack},\n`

            if (this.auto_tiler) {
                msg += `  fork: (${this.auto_tiler.attached.get(win.entity)}),\n`;
            }

            log.debug(msg + '}');
        }
    }

    on_tile_attach(entity: Entity, window: Entity) {
        if (this.auto_tiler) {
            if (!this.auto_tiler.attached.contains(window)) {
                this.windows.with(window, (w) => {
                    if (w.prev_rect === null) {
                        w.prev_rect = w.meta.get_frame_rect();
                    }
                })
            }

            this.auto_tiler.attached.insert(window, entity);
        }
    }

    on_tile_detach(win: Entity) {
        this.windows.with(win, (window) => {
            if (window.prev_rect && !window.ignore_detach) {
                this.register(Events.window_move(this, window, window.prev_rect));
                window.prev_rect = null;
            }
        })
    }

    show_border_on_focused() {
        this.hide_all_borders();

        const focus = this.focus_window();
        if (focus) {
            focus.show_border();
        }
    }

    hide_all_borders() {
        for (const win of this.windows.values()) {
            win.hide_border();
        }
    }

    maximized_on_active_display(): boolean {
        const aws = this.workspace_id();
        for (const window of this.windows.values()) {
            if (!window.actor_exists()) continue;

            const wws = this.workspace_id(window);
            if (aws[0] === wws[0] && aws[1] === wws[1]) {
                if (window.is_maximized()) return true
            }
        }

        return false;
    }

    on_gap_inner() {
        let current = this.settings.gap_inner();
        this.set_gap_inner(current);
        let prev_gap = this.gap_inner_prev / 4 / this.dpi;

        if (current != prev_gap) {
            this.update_inner_gap()
            Gio.Settings.sync();
        }
    }

    update_inner_gap() {
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
    }

    on_gap_outer() {
        let current = this.settings.gap_outer();
        this.set_gap_outer(current);

        let prev_gap = this.gap_outer_prev / 4 / this.dpi;
        let diff = current - prev_gap;

        if (diff != 0) {
            this.set_gap_outer(current);
            this.update_outer_gap(diff);

            Gio.Settings.sync();
        }
    }

    update_outer_gap(diff: number) {
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
    }

    /** Triggered when a grab operation has been ended */
    on_grab_end(meta: Meta.Window, op?: any) {
        let win = this.get_window(meta);

        if (null === win || !win.is_tilable(this)) {
            return;
        }

        win.grab = false;

        this.size_signals_unblock(win);

        if (win.meta && win.meta.minimized) {
            this.on_minimize(win);
            return;
        }

        if (win.is_maximized()) {
            return;
        }

        const grab_op = this.grab_op

        this.grab_op = null

        if (!win) {
            log.error('an entity was dropped, but there is no window')
            return
        }

        if (this.auto_tiler && op === undefined) {
            let mon = this.monitors.get(win.entity)
            if (mon) {
                let rect = win.meta.get_work_area_for_monitor(mon[0])
                if (rect && Rect.Rectangle.from_meta(rect).contains(cursor_rect())) {
                    this.auto_tiler.reflow(this, win.entity);
                } else {
                    this.auto_tiler.on_drop(this, win, true)
                }
            }


            return
        }

        if (!(grab_op && Ecs.entity_eq(grab_op.entity, win.entity))) {
            log.error(`grabbed entity is not the same as the one that was dropped`)
            return
        }

        if (this.auto_tiler) {
            let crect = win.rect()
            const rect = grab_op.rect;
            if (is_move_op(op)) {
                this.monitors.insert(win.entity, [win.meta.get_monitor(), win.workspace_id()])

                if ((rect.x != crect.x || rect.y != crect.y)) {
                    if (rect.contains(cursor_rect())) {
                        this.auto_tiler.reflow(this, win.entity);
                    } else {
                        this.auto_tiler.on_drop(this, win);
                    }
                }
            } else {
                const fork_entity = this.auto_tiler.attached.get(win.entity);
                if (fork_entity) {
                    const forest = this.auto_tiler.forest;
                    const fork = forest.forks.get(fork_entity);
                    if (fork) {
                        if (win.stack) {
                            const tab_dimension = this.dpi * stack.TAB_HEIGHT;
                            crect.height += tab_dimension;
                            crect.y -= tab_dimension;
                        }

                        let top_level = forest.find_toplevel(this.workspace_id());
                        if (top_level) {
                            crect.clamp((forest.forks.get(top_level) as Fork).area);
                        }

                        const movement = grab_op.operation(crect);

                        if (this.movement_is_valid(win, movement)) {
                            forest.resize(this, fork_entity, fork, win.entity, movement, crect);
                            forest.arrange(this, fork.workspace);
                        } else {
                            forest.tile(this, fork, fork.area);
                        }
                    } else {
                        log.error(`no fork component found`);
                    }
                } else {
                    log.error(`no fork entity found`);
                }
            }
        } else if (this.settings.snap_to_grid()) {
            this.tiler.snap(this, win);
        }
    }

    movement_is_valid(win: Window.ShellWindow, movement: movement.Movement) {
        if ((movement & Movement.SHRINK) !== 0) {
            if ((movement & Movement.DOWN) !== 0) {
                const w = this.focus_selector.up(this, win);
                if (!w) return false;
                const r = w.rect();
                if (r.y + r.height > win.rect().y) return false;
            } else if ((movement & Movement.UP) !== 0) {
                const w = this.focus_selector.down(this, win);
                if (!w) return false;
                const r = w.rect();
                if (r.y + r.height < win.rect().y) return false;
            } else if ((movement & Movement.LEFT) !== 0) {
                const w = this.focus_selector.right(this, win);
                if (!w) return false;
                const r = w.rect();
                if (r.x + r.width < win.rect().x) return false;
            } else if ((movement & Movement.RIGHT) !== 0) {
                const w = this.focus_selector.left(this, win);
                if (!w) return false;
                const r = w.rect();
                if (r.x + r.width > win.rect().x) return false;
            }
        }

        return true;
    }

    workspace_window_move(win: Window.ShellWindow, prev_monitor: number, next_monitor: number) {
        const prev_area = win.meta.get_work_area_for_monitor(prev_monitor);
        const next_area = win.meta.get_work_area_for_monitor(next_monitor);

        if (prev_area && next_area) {
            let rect = win.rect();

            rect.x = next_area.x + rect.x - prev_area.x;
            rect.y = next_area.y + rect.y - prev_area.y;

            rect.clamp(next_area);

            this.register(Events.window_move(this, win, rect));
        }
    }

    move_monitor(direction: Meta.DisplayDirection) {
        const win = this.focus_window();
        if (!win) return;

        const prev_monitor = win.meta.get_monitor();
        let next_monitor = Tiling.locate_monitor(win, direction);

        if (next_monitor !== null) {
            if (this.auto_tiler && !this.contains_tag(win.entity, Tags.Floating)) {
                win.ignore_detach = true;
                this.auto_tiler.detach_window(this, win.entity);
                this.auto_tiler.attach_to_workspace(this, win, [next_monitor, win.workspace_id()]);
            } else {
                this.workspace_window_move(win, prev_monitor, next_monitor);
            }
        }

        win.activate_after_move = true;
    }

    /** Moves the focused window across workspaces and displays */
    move_workspace(direction: Meta.DisplayDirection) {
        const win = this.focus_window();
        if (!win) return;

        /** Move a window between workspaces */
        const workspace_move = (direction: Meta.MotionDirection) => {
            const ws = win.meta.get_workspace();
            let neighbor = ws.get_neighbor(direction);

            const last_window = (): boolean => {
                const last = wom.get_n_workspaces() - 2 === ws.index() && ws.n_windows === 1;
                return last;
            }

            const move_to_neighbor = (neighbor: Meta.Workspace) => {
                const monitor = win.meta.get_monitor();
                if (this.auto_tiler && !this.contains_tag(win.entity, Tags.Floating)) {
                    win.ignore_detach = true;
                    this.auto_tiler.detach_window(this, win.entity);
                    this.auto_tiler.attach_to_workspace(this, win, [monitor, neighbor.index()]);

                    if (win.meta.minimized) {
                        this.size_signals_block(win);
                        win.meta.change_workspace_by_index(neighbor.index(), false);
                        this.size_signals_unblock(win);
                    }
                } else {
                    this.workspace_window_move(win, monitor, monitor);
                }

                win.activate_after_move = true;
            }

            if (neighbor && neighbor.index() !== ws.index()) {
                move_to_neighbor(neighbor);
            } else if (direction === Meta.MotionDirection.DOWN && !last_window()) {
                if (this.settings.dynamic_workspaces()) {
                    neighbor = wom.append_new_workspace(false, global.get_current_time());
                } else {
                    return;
                }
            } else if (direction === Meta.MotionDirection.UP && ws.index() === 0) {
                if (this.settings.dynamic_workspaces()) {
                    // Add a new workspace, to push everyone to free up the first one
                    wom.append_new_workspace(false, global.get_current_time());

                    // Move everything one workspace down
                    this.on_workspace_modify(
                        () => true,
                        (current) => current + 1,
                        true
                    );

                    neighbor = wom.get_workspace_by_index(0);

                    if (!neighbor) return;

                    move_to_neighbor(neighbor);
                } else {
                    return
                }
            } else {
                return
            }

            this.size_signals_block(win)
            win.meta.change_workspace_by_index(neighbor.index(), true);
            neighbor.activate_with_focus(win.meta, global.get_current_time());
            this.size_signals_unblock(win)
        };

        switch (direction) {
            case Meta.DisplayDirection.DOWN:
                workspace_move(Meta.MotionDirection.DOWN)
                break;

            case Meta.DisplayDirection.UP:
                workspace_move(Meta.MotionDirection.UP)
                break;
        }

        if (this.auto_tiler) this.restack()
    }

    /** Triggered when a grab operation has been started */
    on_grab_start(meta: null | Meta.Window) {
        if (!meta) return
        let win = this.get_window(meta);
        if (win) {
            win.grab = true;

            if (win.is_tilable(this)) {
                let entity = win.entity;
                let rect = win.rect();

                this.unset_grab_op();

                this.grab_op = new GrabOp.GrabOp(entity, rect);

                this.size_signals_block(win);
            }
        }
    }

    on_gtk_shell_changed() {
        load_theme(this.settings.is_dark_shell() ? Style.Dark : Style.Light);
    }

    on_gtk_theme_change() {
        load_theme(this.settings.is_dark_shell() ? Style.Dark : Style.Light);
    }

    /** Handle window maximization notifications */
    on_maximize(win: Window.ShellWindow) {
        if (win.is_maximized()) {
            // Raise maximized to top so stacks won't appear over them.
            const actor = win.meta.get_compositor_private();
            if (actor) global.window_group.set_child_above_sibling(actor, null);

            if (win.meta.is_fullscreen()) {
                this.size_changed_block();
                win.meta.unmake_fullscreen();
                win.meta.maximize(Meta.MaximizeFlags.BOTH);
                this.size_changed_unblock();
            }

            this.on_monitor_changed(win, (_cfrom, cto, workspace) => {
                if (win) {
                    win.ignore_detach = true;
                    this.monitors.insert(win.entity, [cto, workspace]);
                    this.auto_tiler?.detach_window(this, win.entity);
                }
            });
        } else {
            // Retile on unmaximize after waiting for other events to complete, such as animations
            this.register_fn(() => {
                if (this.auto_tiler) {
                    let fork_ent = this.auto_tiler.attached.get(win.entity);
                    if (fork_ent) {
                        let fork = this.auto_tiler.forest.forks.get(fork_ent);
                        if (fork) this.auto_tiler.tile(this, fork, fork.area);
                    }
                }
            })
        }
    }

    /** Handle window minimization notifications */
    on_minimize(win: Window.ShellWindow) {
        if (this.auto_tiler) {
            if (win.meta.minimized) {
                const attached = this.auto_tiler.attached.get(win.entity)
                if (!attached) return;

                const fork = this.auto_tiler.forest.forks.get(attached);
                if (!fork) return;

                let attachment: boolean | number
                if (win.stack !== null) {
                    attachment = win.stack
                } else {
                    attachment = fork.left.is_window(win.entity)
                }

                win.was_attached_to = [attached, attachment];
                this.auto_tiler.detach_window(this, win.entity);
            } else if (!this.contains_tag(win.entity, Tags.Floating)) {
                if (win.was_attached_to) {
                    const [entity, attachment] = win.was_attached_to;
                    delete win.was_attached_to;

                    const tiler = this.auto_tiler;

                    const fork = tiler.forest.forks.get(entity);
                    if (fork) {
                        if (typeof attachment === "boolean") {
                            tiler.forest.attach_fork(this, fork, win.entity, attachment);
                            tiler.tile(this, fork, fork.area);
                            return
                        } else {
                            const stack = tiler.forest.stacks.get(attachment)
                            if (stack) {
                                const stack_info = tiler.find_stack(stack.active)
                                if (stack_info) {
                                    const node = stack_info[1].inner as node.NodeStack

                                    win.stack = attachment
                                    node.entities.push(win.entity)
                                    tiler.update_stack(this, node)
                                    tiler.forest.on_attach(fork.entity, win.entity)
                                    stack.activate(win.entity)
                                    tiler.tile(this, fork, fork.area);
                                    return
                                }
                            }
                        }
                    }
                }

                this.auto_tiler.auto_tile(this, win, false);
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

    }

    on_overview_shown() {
        this.exit_modes();
        this.unset_grab_op();
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

    on_smart_gap() {
        if (this.auto_tiler) {
            const smart_gaps = this.settings.smart_gaps();
            for (const [entity, [mon,]] of this.auto_tiler.forest.toplevel.values()) {
                const node = this.auto_tiler.forest.forks.get(entity);
                if (node?.right === null) {
                    this.auto_tiler.update_toplevel(this, node, mon, smart_gaps);
                }
            }
        }
    }

    on_window_create(window: Meta.Window, actor: Clutter.Actor) {
        let win = this.get_window(window);
        if (win) {
            const entity = win.entity;
            actor.connect('destroy', () => {
                if (win && win.border)
                    win.border.destroy();
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
                win.ignore_detach = true;
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
        modify: (current: number) => number,
        change_workspace: boolean = false,
    ) {
        function window_move(ext: Ext, entity: Entity, ws: WorkspaceID) {
            if (change_workspace) {
                const window = ext.windows.get(entity);
                if (!window || !window.actor_exists() || window.meta.is_on_all_workspaces()) return;

                ext.size_signals_block(window);
                window.meta.change_workspace_by_index(ws, false);
                ext.size_signals_unblock(window);
            }
        }

        if (this.auto_tiler) {
            for (const [entity, monitor] of this.auto_tiler.forest.toplevel.values()) {
                if (condition(monitor[1])) {
                    const value = modify(monitor[1]);
                    monitor[1] = value;
                    let fork = this.auto_tiler.forest.forks.get(entity);
                    if (fork) {
                        fork.workspace = value;
                        for (const child of this.auto_tiler.forest.iter(entity)) {
                            if (child.inner.kind === 1) {
                                fork = this.auto_tiler.forest.forks.get(child.inner.entity);
                                if (fork) fork.workspace = value;
                            } else if (child.inner.kind === 2) {
                                window_move(this, child.inner.entity, value);
                            } else if (child.inner.kind === 3) {
                                let stack = this.auto_tiler.forest.stacks.get(child.inner.idx);
                                if (stack) {
                                    stack.workspace = value;

                                    for (const entity of child.inner.entities) {
                                        window_move(this, entity, value);
                                    }

                                    stack.restack();
                                }
                            }
                        }
                    }
                }
            }

            // Fix phantom apps in dash
            for (const window of this.windows.values()) {
                if (!window.actor_exists()) this.auto_tiler.detach_window(this, window.entity);
            }
        } else {
            let to_delete = new Array();

            for (const [entity, window] of this.windows.iter()) {
                if (!window.actor_exists()) {
                    to_delete.push(entity);
                    continue
                }

                const ws = window.workspace_id();
                if (condition(ws)) {
                    window_move(this, entity, modify(ws))
                }
            }

            for (const e of to_delete) this.delete_entity(e)
        }
    }

    on_workspace_removed(number: number) {
        this.on_workspace_modify(
            (current) => current > number,
            (prev) => prev - 1
        );
    }

    restack() {
        // NOTE: Workaround for GNOME Shell showing our hidden windows on a workspace switch
        let attempts = 0
        GLib.timeout_add(GLib.PRIORITY_LOW, 50, () => {
            if (this.auto_tiler) {
                for (const container of this.auto_tiler.forest.stacks.values()) {
                    container.restack();
                }
            }

            let x = attempts
            attempts += 1
            return x < 10
        })
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
        this.conf_watch = this.attach_config();

        this.tiler_queue = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (this.tiler_active) return true;

            const m = this.tiler.movements.shift();

            if (m) {
                this.tiler_active = true;

                const callback = () => {
                    m();
                    this.tiler_active = false;
                };

                if (!this.schedule_idle(() => {
                    callback();
                    return false;
                })) {
                    callback();
                }
            }

            return true;
        });

        const workspace_manager = display.get_workspace_manager();

        for (const [, ws] of iter_workspaces(workspace_manager)) {
            let index = ws.index();

            this.connect(ws, 'notify::workspace-index', () => {
                if (ws !== null) {
                    let new_index = ws.index();
                    this.on_workspace_index_changed(index, new_index);
                    index = new_index;
                }
            });
        }

        this.connect(display, 'workareas-changed', () => {
            this.update_display_configuration(true);
        });

        this.size_changed_signal = this.connect(wim, 'size-change', (_, actor, event, _before, _after) => {
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
                    this.show_border_on_focused();
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
                case 'smart-gaps':
                    this.on_smart_gap();
                    this.show_border_on_focused();
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
            if (indicator) {
                indicator.button.visible = !sessionMode.isLocked;
            }

            if (sessionMode.isLocked) {
                this.exit_modes()
            }
        });

        this.connect(overview, 'showing', () => {
            this.register(Events.global(GlobalEvent.OverviewShown));
        });

        this.connect(overview, 'hiding', () => {
            const window = this.focus_window();
            if (window) {
                this.on_focused(window);
            }
            this.register(Events.global(GlobalEvent.OverviewHidden));
        });

        // We have to connect this signal in an idle_add; otherwise work areas stop being calculated
        this.register_fn(() => {
            if (screenShield?.locked) this.update_display_configuration(false);

            this.connect(display, 'notify::focus-window', () => {
                const window = this.focus_window();
                if (window) this.on_focused(window);
            });

            const window = this.focus_window();
            if (window) {
                this.on_focused(window);
            }

            return false;
        });

        this.connect(display, 'window_created', (_, window: Meta.Window) => {
            this.register({ tag: 3, window });
        });

        this.connect(display, 'grab-op-begin', (_, _display, win) => {
            this.on_grab_start(win);
        });

        this.connect(display, 'grab-op-end', (_, _display, win, op) => {
            this.register_fn(() => this.on_grab_end(win, op));
        });

        this.connect(overview, 'window-drag-begin', (_, win) => {
            this.on_grab_start(win)
        })

        this.connect(overview, 'window-drag-end', (_, win) => {
            this.register_fn(() => this.on_grab_end(win))
        })

        this.connect(overview, 'window-drag-cancelled', () => {
            this.unset_grab_op()
        })

        this.connect(wim, 'switch-workspace', () => {
            this.hide_all_borders();
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

        // Bind show desktop and remove the active hint
        this.connect(workspace_manager, 'showing-desktop-changed', () => {
            this.hide_all_borders();
            this.last_focused = null
        });

        St.ThemeContext.get_for_stage(global.stage)
            .connect('notify::scale-factor', () => this.update_scale());

        // Modes

        if (this.settings.tile_by_default() && !this.auto_tiler) {
            this.auto_tiler = new auto_tiler.AutoTiler(
                new Forest.Forest()
                    .connect_on_attach(this.on_tile_attach.bind(this))
                    .connect_on_detach(this.on_tile_detach.bind(this)),
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

        if (this.conf_watch) {
            this.conf_watch[0].disconnect(this.conf_watch[1]);
            this.conf_watch = null;
        }

        if (this.tiler_queue !== null) {
            GLib.source_remove(this.tiler_queue)
        }

        this.signals.clear();
    }

    size_changed_block() {
        utils.block_signal(wim, this.size_changed_signal);
    }

    size_changed_unblock() {
        utils.unblock_signal(wim, this.size_changed_signal);
    }

    size_signals_block(win: Window.ShellWindow) {
        this.add_tag(win.entity, Tags.Blocked);
    }

    size_signals_unblock(win: Window.ShellWindow) {
        this.delete_tag(win.entity, Tags.Blocked);
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

    tab_list(tablist: number, workspace: Meta.Workspace | null): Array<Window.ShellWindow> {
        const windows = display.get_tab_list(tablist, workspace);

        const matched = new Array();

        for (const window of windows) {
            const win = this.get_window(window);
            if (win) matched.push(win);
        }

        return matched;
    }

    * tiled_windows(): IterableIterator<Entity> {
        for (const entity of this.entities()) {
            if (this.contains_tag(entity, Tags.Tiled)) {
                yield entity;
            }
        }
    }

    toggle_tiling() {
        if (this.settings.tile_by_default()) {
            this.auto_tile_off();
        } else {
            this.auto_tile_on();
        }
    }

    auto_tile_off() {
        this.hide_all_borders();
        if (this.schedule_idle(() => {
            this.auto_tile_off()
            return false
        })) {
            return
        }

        if (this.auto_tiler) {
            this.unregister_storage(this.auto_tiler.attached);
            this.auto_tiler.destroy(this);
            this.auto_tiler = null;
            this.settings.set_tile_by_default(false);
            this.tiling_toggle_switch.setToggleState(false);
            this.button.icon.gicon = this.button_gio_icon_auto_off; // type: Gio.Icon

            if (this.settings.active_hint()) {
                this.show_border_on_focused();
            }
        }
    }

    auto_tile_on() {
        this.hide_all_borders();
        if (this.schedule_idle(() => {
            this.auto_tile_on()
            return false;
        })) {
            return
        }

        const original = this.active_workspace();

        let tiler = new auto_tiler.AutoTiler(
            new Forest.Forest()
                .connect_on_attach(this.on_tile_attach.bind(this))
                .connect_on_detach(this.on_tile_detach.bind(this)),
            this.register_storage()
        );

        this.auto_tiler = tiler;

        this.settings.set_tile_by_default(true);
        this.tiling_toggle_switch.setToggleState(true);
        this.button.icon.gicon = this.button_gio_icon_auto_on; // type: Gio.Icon

        for (const window of this.windows.values()) {
            if (window.is_tilable(this)) {
                let actor = window.meta.get_compositor_private();
                if (actor) {
                    if (!window.meta.minimized) {
                        tiler.auto_tile(this, window, false);
                    }
                }
            }
        }

        this.register_fn(() => this.switch_to_workspace(original));
    }

    /** Calls a function once windows are no longer queued for movement. */
    schedule_idle(func: () => boolean): boolean {
        if (!this.movements.is_empty()) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                return func();
            })

            return true
        }
        return false
    }

    should_ignore_workspace(monitor: number): boolean {
        return this.settings.workspaces_only_on_primary() && monitor !== global.display.get_primary_monitor()
    }

    unset_grab_op() {
        if (this.grab_op !== null) {
            let window = this.windows.get(this.grab_op.entity);
            if (window) this.size_signals_unblock(window);
            this.grab_op = null;
        }
    }

    update_display_configuration(_workareas_only: boolean) {
        if (!this.auto_tiler || sessionMode.isLocked) return

        if (this.ignore_display_update) {
            this.ignore_display_update = false
            return
        }

        // Ignore the update if there are no monitors to assign to
        if (layoutManager.monitors.length === 0) return

        if (this.displays_updating !== null) GLib.source_remove(this.displays_updating)

        // Update every tree on each display with the new dimensions
        const update_tiling = () => {
            if (!this.auto_tiler) return

            for (const f of this.auto_tiler.forest.forks.values()) {
                if (!f.is_toplevel) continue

                const display = this.displays.get(f.monitor);

                if (display) {
                    f.set_area(display.ws)
                    this.auto_tiler.update_toplevel(this, f, f.monitor, this.settings.smart_gaps());
                }
            }
        }

        let updated = new Map()
        let changes = new Map()

        // Records which display's windows were moved to what new display's ID
        for (const [entity, w] of this.windows.iter()) {
            if (!w.actor_exists()) continue

            this.monitors.with(entity, ([mon,]) => {
                changes.set(mon, w.meta.get_monitor())
            })
        }

        // Fetch a new list of monitors
        for (const monitor of layoutManager.monitors) {
            const mon = monitor as Monitor

            const area = new Rect.Rectangle([mon.x, mon.y, mon.width, mon.height])
            const ws = this.monitor_work_area(mon.index)

            updated.set(mon.index, { area, ws })
        }

        function compare_maps<K, V>(map1: Map<K, V>, map2: Map<K, V>) {
            if (map1.size !== map2.size) {
                return false
            }

            let cmp

            for (let [key, val] of map1) {
                cmp = map2.get(key)
                if (cmp !== val || (cmp === undefined && !map2.has(key))) {
                    return false
                }
            }

            return true
        }

        // Delay actions until 3 seconds later, in case of temporary connection loss
        this.displays_updating = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            (() => {
                if (!this.auto_tiler) return

                if (compare_maps(this.displays, updated)) {
                    return
                }

                this.displays = updated

                const forest = this.auto_tiler.forest

                let migrations: Array<[Fork, number, Rectangle, boolean]> = new Array()
                let toplevels = new Array()
                let assigned_monitors = new Set()

                for (const [old_mon, new_mon] of changes) {
                    if (old_mon === new_mon) {
                        assigned_monitors.add(new_mon)
                    }
                }

                for (const f of forest.forks.values()) {
                    if (f.is_toplevel) {
                        toplevels.push(f)

                        let migration: null | [Fork, number, Rectangle, boolean] = null;

                        for (const [old_monitor, new_monitor] of changes) {
                            if (old_monitor === new_monitor) continue

                            if (f.monitor === old_monitor) {
                                const display = this.displays.get(new_monitor)

                                if (display) {
                                    f.monitor = new_monitor
                                    f.workspace = 0
                                    migration = [f, new_monitor, display.ws, true]
                                }

                                break
                            }
                        }

                        if (!migration) {
                            const display = this.displays.get(f.monitor)
                            if (display) {
                                migration = [f, f.monitor, display.ws, false]
                            }
                        }

                        if (migration) migrations.push(migration)
                    }
                }

                let iterator = migrations[Symbol.iterator]()

                GLib.timeout_add(GLib.PRIORITY_LOW, 500, () => {
                    let next: null | [Fork, number, Rectangle, boolean] = iterator.next().value;

                    if (next) {
                        const [fork, new_monitor, workspace, find_workspace] = next
                        let new_workspace

                        if (find_workspace) {
                            if (assigned_monitors.has(new_monitor)) {
                                [new_workspace] = this.find_unused_workspace(new_monitor)
                            } else {
                                assigned_monitors.add(new_monitor)
                                new_workspace = 0
                            }
                        } else {
                            new_workspace = fork.workspace
                        }

                        fork.migrate(this, forest, workspace, new_monitor, new_workspace);
                        return true
                    }

                    update_tiling()

                    return false
                })

                return
            })()

            this.displays_updating = null
            return false
        })
    }

    update_scale() {
        const new_dpi = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const diff = new_dpi / this.dpi;
        this.dpi = new_dpi;

        this.column_size *= diff;
        this.row_size *= diff;

        this.gap_inner_prev *= diff;
        this.gap_inner *= diff;
        this.gap_inner_half *= diff;
        this.gap_outer_prev *= diff;
        this.gap_outer *= diff;

        this.update_inner_gap();
        this.update_outer_gap(diff);
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

    /// Returns the window(s) that the mouse pointer is currently hovering above.
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
        const monitor = display.get_monitor_index_for_rect(rect);
        return [cursor, monitor];
    }

    /** Fetch a workspace by its index */
    workspace_by_id(id: number): Meta.Workspace | null {
        return display.get_workspace_manager().get_workspace_by_index(id);
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
    log.info("init");
}

// @ts-ignore
function enable() {
    log.info("enable");

    if (!ext) {
        ext = new Ext();

        ext.register_fn(() => {
            if (ext?.auto_tiler) ext.snap_windows();
        });
    }

    if (ext.was_locked) {
        ext.was_locked = false;
        return;
    }

    ext.signals_attach();

    layoutManager.addChrome(ext.overlay);

    if (!indicator) {
        indicator = new PanelSettings.Indicator(ext);
        panel.addToStatusArea('pop-shell', indicator.button);
    }

    ext.keybindings.enable(ext.keybindings.global)
        .enable(ext.keybindings.window_focus);

    if (ext.settings.tile_by_default()) {
        ext.auto_tile_on();
    }
}

// @ts-ignore
function disable() {
    log.info("disable");

    if (ext) {
        if (sessionMode.isLocked) {
            ext.was_locked = true;
            return;
        }

        ext.signals_remove();
        ext.exit_modes();

        ext.hide_all_borders();

        layoutManager.removeChrome(ext.overlay);

        ext.keybindings.disable(ext.keybindings.global)
            .disable(ext.keybindings.window_focus)

        if (ext.auto_tiler) {
            ext.auto_tiler.destroy(ext);
            ext.auto_tiler = null;
        }
    }

    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
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
        log.error("failed to load stylesheet: " + e);
        return null;
    }
}

function* iter_workspaces(manager: any): IterableIterator<[number, any]> {
    let idx = 0;
    let ws = manager.get_workspace_by_index(idx);
    while (ws !== null) {
        yield [idx, ws];
        idx += 1;
        ws = manager.get_workspace_by_index(idx);
    }
}
