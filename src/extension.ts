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
import * as launcher from 'launcher';
import * as auto_tiler from 'auto_tiler';
import * as node from 'node';
import * as utils from 'utils';
import * as Executor from 'executor';
import * as movement from 'movement';
import * as stack from 'stack';
import * as add_exception from 'dialog_add_exception';
import * as exec from 'executor';
import * as dbus_service from 'dbus_service';

import type { Entity } from 'ecs';
import type { ExtEvent } from 'events';
import type { Rectangle } from 'rectangle';
import type { Indicator } from 'panel_settings';
import type { Launcher } from 'launcher';

import { Fork } from './fork';

const display = global.display;
const wim = global.window_manager;
const wom = global.workspace_manager;

const Movement = movement.Movement;

const GLib: GLib = imports.gi.GLib;

const { Gio, Meta, St, Shell } = imports.gi;
const { GlobalEvent, WindowEvent } = Events;
const { cursor_rect, is_move_op } = Lib;
const { layoutManager, loadTheme, overview, panel, setThemeStylesheet, screenShield, sessionMode, windowAttentionHandler } = imports.ui.main;
const { ScreenShield } = imports.ui.screenShield;
const { AppSwitcher, AppIcon, WindowSwitcherPopup } = imports.ui.altTab;
const { SwitcherList } = imports.ui.switcherPopup;
const { Workspace } = imports.ui.workspace;
const { WorkspaceThumbnail } = imports.ui.workspaceThumbnail;
const Tags = Me.imports.tags;

const STYLESHEET_PATHS = ['light', 'dark', 'highcontrast'].map(stylesheet_path);
const STYLESHEETS = STYLESHEET_PATHS.map((path) => Gio.File.new_for_path(path));
const GNOME_VERSION = imports.misc.config.PACKAGE_VERSION;

enum Style { Light, Dark, HighContrast }

interface Display {
    area: Rectangle;
    ws: Rectangle;
}

interface Monitor extends Rectangular {
    index: number;
}

interface Injection {
    object: any;
    method: string;
    func: any;
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

    /** DBus */
    dbus: dbus_service.Service = new dbus_service.Service();

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
    current_style: Style = Style.Dark;

    /** Set when the display configuration has been triggered for execution */
    displays_updating: SignalID | null = null;

    /** Row size in snap-to-grid */
    row_size: number = 32;

    /** The known display configuration, for tracking monitor removals and changes */
    displays: [number, Map<number, Display>] = [global.display.get_primary_monitor(), new Map()];

    /** The current scaling factor in GNOME Shell */
    dpi: number = St.ThemeContext.get_for_stage(global.stage).scale_factor;

    drag_signal: null | SignalID = null

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

    /** Functions replaced in GNOME */
    injections: Array<Injection> = new Array();

    /** The window that was focused before the last window */
    private prev_focused: [null | Entity, null | Entity] = [null, null];

    tween_signals: Map<string, [SignalID, any]> = new Map();

    /** Initially set to true when the extension is initializing */
    init: boolean = true;

    was_locked: boolean = false;

    /** Set when a window is being moved by the mouse */
    moved_by_mouse: boolean = false

    private workareas_update: null | SignalID = null

    /** Record of misc. global objects and their attached signals */
    private signals: Map<GObject.Object, Array<SignalID>> = new Map();

    private size_requests: Map<GObject.Object, SignalID> = new Map();

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

    constructor() {
        super(new Executor.GLibExecutor());

        this.load_settings();
        this.reload_theme()

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

        this.dbus.FocusUp = () => this.focus_up()
        this.dbus.FocusDown = () => this.focus_down()
        this.dbus.FocusLeft = () => this.focus_left()
        this.dbus.FocusRight = () => this.focus_right()
        this.dbus.Launcher = () => this.window_search.open(this)

        this.dbus.WindowFocus = (window: [number, number]) => {
            this.windows.get(window)?.activate()
            this.window_search.close()
        }

        this.dbus.WindowList = (): Array<[[number, number], string, string]> => {
            const wins = new Array()

            for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
                wins.push([
                    window.entity,
                    window.title(),
                    window.name(this)
                ])
            }

            return wins;
        }

        this.dbus.WindowQuit = (win: [number, number]) => {
            this.windows.get(win)?.meta.delete(global.get_current_time())
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
                        this.unset_grab_op()
                        this.on_maximize(win);
                        break

                    case WindowEvent.Minimize:
                        this.unset_grab_op()
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
                                        this.auto_tiler.forest.stacks.get(win.stack)?.set_visible(true)
                                    }
                                } else { // not full screened
                                    if (win.stack !== null) {
                                        this.auto_tiler.forest.stacks.get(win.stack)?.set_visible(false)
                                    }
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
        return this.tab_list(Meta.TabList.NORMAL_ALL, workspace);
    }

    active_workspace(): number {
        return wom.get_active_workspace_index();
    }

    actor_of(entity: Entity): null | Clutter.Actor {
        const window = this.windows.get(entity);
        return window ? window.meta.get_compositor_private() : null;
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
                if (wmclass !== null && wmclass.length === 0) {
                    wmclass = win.name(this)
                }

                if (wmclass) this.conf.add_app_exception(wmclass);
                this.exception_dialog()
            },
            // current-window
            () => {
                let wmclass = win.meta.get_wm_class();
                if (wmclass) this.conf.add_window_exception(
                    wmclass,
                    win.title()
                );
                this.exception_dialog()
            },
            // Reload the tiling config on dialog close
            () => {
                this.conf.reload()
                this.tiling_config_reapply()
            }
        );
        d.open();
    }

    exception_dialog() {
        let path = Me.dir.get_path() + "/floating_exceptions/main.js";
        const cancellable = new Gio.Cancellable();

        const event_handler = (event: string): boolean => {
            switch (event) {
                case "MODIFIED":
                    this.register_fn(() => {
                        this.conf.reload()
                        this.tiling_config_reapply()
                    })
                    break
                case "SELECT":
                    this.register_fn(() => this.exception_select())
                    return false
            }

            return true
        }

        const ipc = utils.async_process_ipc(["gjs", path])

        if (ipc) {
            const generator = (stdout: any, res: any) => {
                try {
                    const [bytes,] = stdout.read_line_finish(res)
                    if (bytes) {
                        if (event_handler((imports.byteArray.toString(bytes) as string).trim())) {
                            ipc.stdout.read_line_async(0, cancellable, generator)
                        }
                    }
                } catch (why) {
                    log.error(`failed to read response from floating exceptions dialog: ${why}`)
                }
            }

            ipc.stdout.read_line_async(0, cancellable, generator)
        }
    }

    exception_select() {
        GLib.timeout_add(GLib.PRIORITY_LOW, 500, () => {
            this.exception_selecting = true
            overview.show()
            return false
        })
    }

    exit_modes() {
        this.tiler.exit(this);
        this.window_search.reset();
        this.window_search.close();
        this.overlay.visible = false;
    }

    find_monitor_to_retach(width: number, height: number): [number, Display] {
        if (!this.settings.workspaces_only_on_primary()) {
            for (const [index, display] of this.displays[1]) {
                if (display.area.width == width && display.area.height == height) {
                    return [index, display];
                }
            }
        }

        const primary = display.get_primary_monitor();
        return [primary, this.displays[1].get(primary) as Display];
    }

    find_unused_workspace(monitor: number): [number, any] {
        if (!this.auto_tiler) return [0, wom.get_workspace_by_index(0)]

        let id = 0

        const tiled_windows = new Array<Window.ShellWindow>()

        for (const [window] of this.auto_tiler.attached.iter()) {
            if (!this.auto_tiler.attached.contains(window)) continue

            const win = this.windows.get(window)

            if (win && !win.reassignment && win.meta.get_monitor() === monitor) tiled_windows.push(win)
        }

        cancel:
        while (true) {
            for (const window of tiled_windows) {
                if (window.workspace_id() === id) {
                    id += 1
                    continue cancel
                }
            }

            break
        }

        let new_work

        if (id + 1 === wom.get_n_workspaces()) {
            id += 1
            new_work = wom.append_new_workspace(true, global.get_current_time())
        } else {
            new_work = wom.get_workspace_by_index(id)
        }

        return [id, new_work];
    }

    focus_left() {
        this.stack_select(
            (id, stack) => id === 0 ? null : stack.tabs[id - 1].entity,
            () => this.activate_window(this.focus_selector.left(this, null))
        );
    }

    focus_right() {
        this.stack_select(
            (id, stack) => stack.tabs.length > id + 1 ? stack.tabs[id + 1].entity : null,
            () => this.activate_window(this.focus_selector.right(this, null))
        )
    }

    focus_down() {
        this.activate_window(this.focus_selector.down(this, null))
    }

    focus_up() {
        this.activate_window(this.focus_selector.up(this, null))
    }

    focus_window(): Window.ShellWindow | null {
        return this.get_window(display.get_focus_window())
    }

    stack_select(
        select: (id: number, stack: stack.Stack) => Entity | null,
        focus_shift: () => void,
    ) {
        const switched = this.stack_switch((stack: any) => {
            if (!stack) return false;

            const stack_con = this.auto_tiler?.forest.stacks.get(stack.idx);
            if (stack_con) {
                const id = stack_con.active_id;
                if (id !== -1) {
                    const next = select(id, stack_con);
                    if (next) {
                        stack_con.activate(next);
                        const window = this.windows.get(next)
                        if (window) {
                            window.activate();
                            return true;
                        }
                    }
                }
            }

            return false;
        });

        if (!switched) {
            focus_shift();
        }
    }

    stack_switch(apply: (stack: node.NodeStack) => boolean) {
        const window = this.focus_window();
        if (window) {
            if (this.auto_tiler) {
                const node = this.auto_tiler.find_stack(window.entity);
                return node ? apply(node[1].inner as node.NodeStack) : false;
            }
        }
    }

    /// Fetches the window component from the entity associated with the metacity window metadata.
    get_window(meta: Meta.Window | null): Window.ShellWindow | null {
        let entity = this.window_entity(meta);
        return entity ? this.windows.get(entity) : null;
    }

    inject(object: any, method: string, func: any) {
        const prev = object[method];
        this.injections.push({ object, method, func: prev })
        object[method] = func;
    }

    injections_add() {
        const screen_unlock_fn = ScreenShield.prototype['deactivate'];
        this.inject(ScreenShield.prototype, 'deactivate', (args: any) => {
            screen_unlock_fn.apply(screenShield, [args]);
            this.update_display_configuration(true);
        })
    }

    injections_remove() {
        for (const { object, method, func } of this.injections.splice(0)) {
            object[method] = func
        }
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
        const meta = wom
            .get_active_workspace()
            .get_work_area_for_monitor(monitor);

        return Rect.Rectangle.from_meta(meta as Rectangular);
    }

    on_active_workspace_changed() {
        this.exit_modes();
        this.prev_focused = [null, null]
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
        this.size_signals_unblock(win);

        if (this.exception_selecting) {
            this.exception_add(win)
        }

        // Track history of focused windows, but do not permit duplicates.
        if (this.prev_focused[1] !== win.entity) {
            this.prev_focused[0] = this.prev_focused[1];
            this.prev_focused[1] = win.entity;
        }

        // Update the active tab in the stack.
        if (null !== this.auto_tiler && null !== win.stack) {
            win.meta.raise();
            ext?.auto_tiler?.forest.stacks.get(win.stack)?.activate(win.entity)
        }

        this.show_border_on_focused();

        if (this.auto_tiler && this.prev_focused[0] !== null) {
            let prev = this.windows.get(this.prev_focused[0]);
            let is_attached = this.auto_tiler.attached.contains(this.prev_focused[0]);

            if (prev && prev !== win && is_attached && prev.actor_exists() && prev.name(this) !== win.name(this)) {
                if (prev.rect().contains(win.rect())) {
                    if (prev.is_maximized()) {
                        prev.meta.unmaximize(Meta.MaximizeFlags.BOTH);
                    }

                    if (prev.meta.is_fullscreen()) {
                        prev.meta.unmake_fullscreen();
                    }
                } else if (prev.stack) {
                    prev.meta.unmaximize(Meta.MaximizeFlags.BOTH)
                    prev.meta.unmake_fullscreen()
                    this.auto_tiler.forest.stacks.get(prev.stack)?.restack()
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

        if (win !== null) {
            win.grab = false
        }

        if (null === win || !win.is_tilable(this)) {
            this.unset_grab_op()
            return;
        }

        this.on_grab_end_(win, op);
        this.unset_grab_op()
    }

    on_grab_end_(win: Window.ShellWindow, op?: any) {
        this.moved_by_mouse = true
        this.size_signals_unblock(win);

        if (win.meta && win.meta.minimized) {
            this.on_minimize(win)
            return;
        }

        if (win.is_maximized()) {
            return;
        }

        const grab_op = this.grab_op

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
                const cmon = win.meta.get_monitor()
                const prev_mon = this.monitors.get(win.entity)
                const mon_drop = prev_mon ? prev_mon[0] !== cmon : false

                this.monitors.insert(win.entity, [win.meta.get_monitor(), win.workspace_id()])

                if ((rect.x != crect.x || rect.y != crect.y)) {
                    if (rect.contains(cursor_rect())) {
                        if (this.auto_tiler.attached.contains(win.entity)) {
                            this.auto_tiler.on_drop(this, win, mon_drop)
                        } else {
                            this.auto_tiler.reflow(this, win.entity)
                        }
                    } else {
                        this.auto_tiler.on_drop(this, win, mon_drop);
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

    previously_focused(active: Window.ShellWindow): null | Ecs.Entity {
        for (const id of [1, 0]) {
            const prev = this.prev_focused[id]
            if (prev && ! Ecs.entity_eq(active.entity, prev)) {
                return prev;
            }
        }

        return null
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
            // get the current window rect
            let rect = win.rect();

            let h_ratio: number = 1;
            let w_ratio: number = 1;

            h_ratio = next_area.height / prev_area.height;
            rect.height = rect.height * h_ratio;

            w_ratio = next_area.width / prev_area.width;
            rect.width = rect.width * w_ratio;

            if (next_area.x < prev_area.x) {
                rect.x = ((next_area.x + rect.x - prev_area.x) / prev_area.width) * next_area.width;
            } else if (next_area.x > prev_area.x) {
                rect.x = ((rect.x / prev_area.width) * next_area.width) + next_area.x;
            }

            if (next_area.y < prev_area.y) {
                rect.y = ((next_area.y + rect.y - prev_area.y) / prev_area.height) * next_area.height;
            } else if (next_area.y > prev_area.y) {
                rect.y = ((rect.y / prev_area.height) * next_area.height) + next_area.y;
            }


            if (this.auto_tiler) {
                if (this.is_floating(win)) {
                    win.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
                    win.meta.unmaximize(Meta.MaximizeFlags.VERTICAL);
                    win.meta.unmaximize(Meta.MaximizeFlags.BOTH);
                }
                this.register(Events.window_move(this, win, rect));
            } else {
                win.move(this, rect, () => {}, false);
                // if the resulting dimensions of rect == next
                if (rect.width == next_area.width && rect.height == next_area.height) {
                    win.meta.maximize(Meta.MaximizeFlags.BOTH)
                }
            }
        }
    }

    move_monitor(direction: Meta.DisplayDirection) {
        const win = this.focus_window();
        if (!win) return;
        if (win && win.meta.is_fullscreen())
            win.meta.unmake_fullscreen();

        const prev_monitor = win.meta.get_monitor();
        let next_monitor = Tiling.locate_monitor(win, direction);

        if (next_monitor !== null) {
            if (this.auto_tiler && !this.is_floating(win)) {
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
        if (win && win.meta.is_fullscreen())
            win.meta.unmake_fullscreen();

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
                if (this.auto_tiler && win.is_tilable(this)) {
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
    on_grab_start(meta: null | Meta.Window, op: any) {
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

                /** Display an overlay indicating where the window will be placed if dropped */

                if (overview.visible || !win || op !== 1) return

                const workspace = this.active_workspace();

                this.drag_signal = GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
                    this.overlay.visible = false

                    if (!win || !this.auto_tiler || !this.grab_op || this.grab_op.entity !== entity) {
                        this.drag_signal = null
                        return false
                    }

                    const [cursor, monitor] = this.cursor_status();

                    let attach_to = null
                    for (const found of this.windows_at_pointer(cursor, monitor, workspace)) {
                        if (found != win && this.auto_tiler.attached.contains(found.entity)) {
                            attach_to = found;
                            break
                        }
                    }

                    const fork = this.auto_tiler.get_parent_fork(entity)
                    if (!fork) return true;

                    let windowless = this.auto_tiler.largest_on_workspace(this, monitor, workspace) === null

                    if (attach_to === null) {
                        if (fork.left.inner.kind === 2 && fork.right?.inner.kind === 2) {
                            let attaching = fork.left.is_window(entity)
                                ? fork.right.inner.entity
                                : fork.left.inner.entity

                            attach_to = this.windows.get(attaching)
                        }
                    }

                    let area, monitor_attachment

                    if (windowless) {
                        [area, monitor_attachment] = [this.monitor_work_area(monitor), true]
                        area.x += this.gap_outer
                        area.y += this.gap_outer
                        area.width -= this.gap_outer * 2
                        area.height -= this.gap_outer * 2
                    } else if (attach_to) {
                        const is_sibling = this.auto_tiler.windows_are_siblings(entity, attach_to.entity);

                        [area, monitor_attachment] = ((win.stack === null && attach_to.stack === null && is_sibling))
                            || (win.stack === null && is_sibling)
                                ? [fork.area, false]
                                : [attach_to.meta.get_frame_rect(), false]
                    } else {
                        return true
                    }

                    const result = monitor_attachment
                        ? null
                        : auto_tiler.cursor_placement(area, cursor)

                    if (!result) {
                        this.overlay.x = area.x
                        this.overlay.y = area.y
                        this.overlay.width = area.width
                        this.overlay.height = area.height

                        this.overlay.visible = true

                        return true
                    }

                    const { orientation, swap } = result

                    const half_width = area.width / 2
                    const half_height = area.height / 2

                    let new_area: [number, number, number, number] =
                    orientation === Lib.Orientation.HORIZONTAL
                        ? swap
                            ? [area.x, area.y, half_width, area.height]
                            : [area.x + half_width, area.y, half_width, area.height]
                        : swap
                            ? [area.x, area.y, area.width, half_height]
                            : [area.x, area.y + half_height, area.width, half_height]

                    this.overlay.x = new_area[0]
                    this.overlay.y = new_area[1]
                    this.overlay.width = new_area[2]
                    this.overlay.height = new_area[3]

                    this.overlay.visible = true

                    return true
                })
            }
        }
    }

    on_gtk_shell_changed() {
        this.reload_theme();
        load_theme(this.current_style)
    }

    on_gtk_theme_change() {
        this.reload_theme()
        load_theme(this.current_style)
    }

    reload_theme() {
        this.current_style = this.settings.is_dark()
            ? Style.Dark
            : this.settings.is_high_contrast() ? Style.HighContrast : Style.Light
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

    on_overview_shown() {
        this.exit_modes();
        this.unset_grab_op();
    }

    on_show_window_titles() {
        const show_title = this.settings.show_title()

        if (indicator) {
            indicator.toggle_titles.setToggleState(show_title)
        }

        for (const window of this.windows.values()) {
            if (window.meta.is_client_decorated()) continue;

            if (show_title) {
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
                if (win.is_tilable(this)) {
                    this.auto_tiler.detach_window(this, win.entity);
                    this.auto_tiler.attach_to_workspace(this, win, id);
                }
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
        // this.conf_watch = this.attach_config();

        this.tiler.queue.start(100, (movement) => {
            movement()
            return true
        })

        const workspace_manager = wom;

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
                    if (indicator)
                        indicator.toggle_active.setToggleState(this.settings.active_hint())

                    this.show_border_on_focused();
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
                    break;
                case 'show-skip-taskbar':
                    if (this.settings.show_skiptaskbar()) {
                        _show_skip_taskbar_windows(this);
                    } else {
                        _hide_skip_taskbar_windows();
                    }
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
                const window = this.get_window(display.get_focus_window())
                if (window) this.on_focused(window)
                return false
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

        if (GNOME_VERSION?.startsWith("3.")) {
            this.connect(display, 'grab-op-begin', (_, _display, win, op) => {
                this.on_grab_start(win, op);
            });

            this.connect(display, 'grab-op-end', (_, _display, win, op) => {
                this.register_fn(() => this.on_grab_end(win, op));
            });
        } else {
            // GNOME 40 removed the first argument of the callback
            this.connect(display, 'grab-op-begin', (_display, win, op) => {
                this.on_grab_start(win, op);
            });

            this.connect(display, 'grab-op-end', (_display, win, op) => {
                this.register_fn(() => this.on_grab_end(win, op));
            });
        }

        this.connect(overview, 'window-drag-begin', (_, win) => {
            this.on_grab_start(win, 1)
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
            this.prev_focused = [null, null]
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

        this.tiler.queue.stop()

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

    stop_launcher_services() {
        this.window_search.stop_services(this)
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

    /// If the auto-tilable status of a window has changed, detach or attach the window.
    tiling_config_reapply() {
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

            if (indicator) indicator.toggle_tiled.setToggleState(false)

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

        if (indicator) indicator.toggle_tiled.setToggleState(true)

        const original = this.active_workspace();

        let tiler = new auto_tiler.AutoTiler(
            new Forest.Forest()
                .connect_on_attach(this.on_tile_attach.bind(this))
                .connect_on_detach(this.on_tile_detach.bind(this)),
            this.register_storage()
        );

        this.auto_tiler = tiler;

        this.settings.set_tile_by_default(true);
        this.button.icon.gicon = this.button_gio_icon_auto_on; // type: Gio.Icon

        for (const window of this.windows.values()) {
            if (window.is_tilable(this)) {
                let actor = window.meta.get_compositor_private();
                if (actor) {
                    if (!window.meta.minimized) {
                        tiler.auto_tile(this, window, true);
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
        if (this.drag_signal !== null) {
            this.overlay.visible = false
            GLib.source_remove(this.drag_signal)
            this.drag_signal = null
        }

        if (this.grab_op !== null) {
            let window = this.windows.get(this.grab_op.entity);
            if (window) this.size_signals_unblock(window);
            this.grab_op = null;
        }

        this.moved_by_mouse = false
    }

    update_display_configuration_before() {

    }

    update_display_configuration(workareas_only: boolean) {
        if (!this.auto_tiler || sessionMode.isLocked) return

        if (this.ignore_display_update) {
            this.ignore_display_update = false
            return
        }

        // Ignore the update if there are no monitors to assign to
        if (layoutManager.monitors.length === 0) return

        const primary_display = global.display.get_primary_monitor()

        const primary_display_ready = (ext: Ext): boolean => {
            const area = global.display.get_monitor_geometry(primary_display)
            const work_area = ext.monitor_work_area(primary_display)

            if (!area || !work_area) return false

            return !(area.width === work_area.width && area.height === work_area.height)
        }

        function displays_ready(): boolean {
            const monitors = global.display.get_n_monitors()

            if (monitors === 0) return false

            for (let i = 0; i < monitors; i += 1) {
                const display = global.display.get_monitor_geometry(i)

                if (!display) return false

                if (display.width < 1 || display.height < 1) return false
            }

            return true
        }

        if (!displays_ready() || !primary_display_ready(this)) {
            if (this.displays_updating !== null) return
            if (this.workareas_update !== null) GLib.source_remove(this.workareas_update)

            this.workareas_update = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this.register_fn(() => {
                    this.update_display_configuration(workareas_only)
                })

                this.workareas_update = null

                return false
            })

            return
        }

        // Update every tree on each display with the new dimensions
        const update_tiling = () => {
            if (!this.auto_tiler) return

            for (const f of this.auto_tiler.forest.forks.values()) {
                if (!f.is_toplevel) continue

                const display = this.monitor_work_area(f.monitor)

                if (display) {
                    const area = new Rect.Rectangle([display.x, display.y, display.width, display.height])

                    f.smart_gapped = false
                    f.set_area(area.clone());
                    this.auto_tiler.update_toplevel(this, f, f.monitor, this.settings.smart_gaps());
                }
            }
        }

        type Migration = [Fork, number, Rectangle, boolean]

        let migrations: Array<Migration> = new Array()

        const apply_migrations = (assigned_monitors: Set<number>) => {
            if (!migrations) return

            new exec.OnceExecutor<Migration, Migration[]>(migrations)
                .start(
                    500,
                    ([fork, new_monitor, workspace, find_workspace]) => {
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
                        fork.set_ratio(fork.length() / 2)

                        return true
                    },
                    () => update_tiling()
            )
        }

        function mark_for_reassignment(ext: Ext, fork: Ecs.Entity) {
            for (const win of forest.iter(fork, node.NodeKind.WINDOW)) {
                if (win.inner.kind === 2) {
                    const entity = win.inner.entity
                    const window = ext.windows.get(entity)
                    if (window) window.reassignment = true
                }
            }
        }

        const [ old_primary, old_displays ] = this.displays

        const changes = new Map<number, number>()

        // Records which display's windows were moved to what new display's ID
        for (const [entity, w] of this.windows.iter()) {
            if (!w.actor_exists()) continue

            this.monitors.with(entity, ([mon,]) => {
                const assignment = mon === old_primary ? primary_display : w.meta.get_monitor()
                changes.set(mon, assignment)
            })
        }

        // Fetch a new list of monitors
        const updated = new Map()

        for (const monitor of layoutManager.monitors) {
            const mon = monitor as Monitor

            const area = new Rect.Rectangle([mon.x, mon.y, mon.width, mon.height])
            const ws = this.monitor_work_area(mon.index)

            updated.set(mon.index, { area, ws })
        }

        const forest = this.auto_tiler.forest

        if (old_displays.size === updated.size) {
            update_tiling()

            this.displays = [primary_display, updated]

            return
        }

        this.displays = [primary_display, updated]

        if (utils.map_eq(old_displays, updated)) {
            return
        }

        if (this.displays_updating !== null) GLib.source_remove(this.displays_updating)

        if (this.workareas_update !== null) {
            GLib.source_remove(this.workareas_update)
            this.workareas_update = null
        }

        // Delay actions in case of temporary connection loss
        this.displays_updating = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            (() => {
                if (!this.auto_tiler) return

                const toplevels = new Array()
                const assigned_monitors = new Set<number>()

                for (const [old_mon, new_mon] of changes) {
                    if (old_mon === new_mon) assigned_monitors.add(new_mon)
                }

                for (const f of forest.forks.values()) {
                    if (f.is_toplevel) {
                        toplevels.push(f)

                        let migration: null | [Fork, number, Rectangle, boolean] = null;

                        const displays = this.displays[1]

                        for (const [old_monitor, new_monitor] of changes) {
                            const display = displays.get(new_monitor)

                            if (!display) continue

                            if (f.monitor === old_monitor) {
                                f.monitor = new_monitor
                                f.workspace = 0
                                migration = [f, new_monitor, display.ws, true]
                            }
                        }

                        if (!migration) {
                            const display = displays.get(f.monitor)
                            if (display) {
                                migration = [f, f.monitor, display.ws, false]
                            }
                        }

                        if (migration) {
                            mark_for_reassignment(this, migration[0].entity)
                            migrations.push(migration)
                        }
                    }
                }

                apply_migrations(assigned_monitors)

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

    /// Returns the tilable window(s) that the mouse pointer is currently hovering above.
    * windows_at_pointer(
        cursor: Rectangle,
        monitor: number,
        workspace: number
    ): IterableIterator<Window.ShellWindow> {
        for (const entity of this.monitors.find((m) => m[0] == monitor && m[1] == workspace)) {
            let window = this.windows.with(entity, (window) => {
                return window.is_tilable(this) && window.rect().contains(cursor) ? window : null;
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
        return wom.get_workspace_by_index(id);
    }

    workspace_id(window: Window.ShellWindow | null = null): [number, number] {

        let id: [number, number] = window
            ? [window.meta.get_monitor(), window.workspace_id()]
            : [this.active_monitor(), this.active_workspace()];


        id[0] = Math.max(0, id[0]);
        id[1] = Math.max(0, id[1]);

        return id;
    }

    is_floating(window: Window.ShellWindow): boolean {
        let shall_float: boolean = false;
        let wm_class = window.meta.get_wm_class();
        let wm_title = window.meta.get_title();

        if (wm_class && wm_title) {
            shall_float = this.conf.window_shall_float(wm_class, wm_title)
        }

        let floating_tagged = this.contains_tag(window.entity, Tags.Floating);
        let force_tiled_tagged = this.contains_tag(window.entity, Tags.ForceTile);
        // Tags.Tiled does not seem to matter, so not checking here

        return (floating_tagged && !force_tiled_tagged) ||
            (shall_float && !force_tiled_tagged);
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

    if (ext.settings.show_skiptaskbar()) {
        _show_skip_taskbar_windows(ext);
    } else {
        _hide_skip_taskbar_windows();
    }

    if (ext.was_locked) {
        ext.was_locked = false;
        return;
    }

    ext.injections_add();
    ext.signals_attach();

    disable_window_attention_handler()

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

        ext.injections_remove();
        ext.signals_remove();
        ext.exit_modes();
        ext.stop_launcher_services();
        ext.hide_all_borders();
        ext.window_search.remove_injections()

        layoutManager.removeChrome(ext.overlay);

        ext.keybindings.disable(ext.keybindings.global)
            .disable(ext.keybindings.window_focus)

        if (ext.auto_tiler) {
            ext.auto_tiler.destroy(ext);
            ext.auto_tiler = null;
        }

        _hide_skip_taskbar_windows();
    }

    if (indicator) {
        indicator.destroy();
        indicator = null;
    }

    enable_window_attention_handler()
}

const handler = windowAttentionHandler

function enable_window_attention_handler() {
    if (handler && !handler._windowDemandsAttentionId) {
        handler._windowDemandsAttentionId = global.display.connect('window-demands-attention', (display, window) => {
            handler._onWindowDemandsAttention(display, window)
        })
    }
}

function disable_window_attention_handler() {
    if (handler && handler._windowDemandsAttentionId) {
        global.display.disconnect(handler._windowDemandsAttentionId);
        handler._windowDemandsAttentionId = null
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

let default_isoverviewwindow_ws: any;
let default_isoverviewwindow_ws_thumbnail: any;
let default_init_appswitcher: any;
let default_getwindowlist_windowswitcher: any;
let default_getcaption_windowpreview: any;
let default_getcaption_workspace: any;

/**
 * Decorates the default gnome-shell workspace/overview handling
 * of skip_task_bar. And have those window types included in pop-shell.
 * Should only be called on extension#enable()
 *
 * NOTE to future maintainer:
 * Skip taskbar has been left out by upstream for a reason. And the
 * Shell.WindowTracker seems to skip handling skip taskbar windows, so they are
 * null or undefined. GNOME 40+ and lower version checking should be done to
 * constantly support having them within pop-shell.
 *
 * Known skip taskbars ddterm, conky, guake, minimized to tray apps, etc.
 *
 * While minimize to tray are the target for this feature,
 * skip taskbars that float/and avail workspace all
 * need to added to config.ts as default floating
 *
 */
function _show_skip_taskbar_windows(ext: Ext) {
    let cfg = ext.conf;
    if (!GNOME_VERSION?.startsWith("40.")) {
        // TODO GNOME 40 added a call to windowtracker and app var is not checked if null
        // in WindowPreview._init(). Then new WindowPreview() is being called on
        // _addWindowClone() of workspace.js.
        // So it has to be skipped being overriden for now.

        // Handle the overview
        if (!default_isoverviewwindow_ws) {
            default_isoverviewwindow_ws = Workspace.prototype._isOverviewWindow;
            Workspace.prototype._isOverviewWindow = function(win: any) {
                let meta_win = win;
                if (GNOME_VERSION?.startsWith("3.36"))
                    meta_win = win.get_meta_window();

                let gnome_shell_wm_class = meta_win.get_wm_class() === "Gjs" ||
                    meta_win.get_wm_class() === "Gnome-shell";
                let show_skiptb = !cfg.skiptaskbar_shall_hide(meta_win);
                return (show_skiptb && meta_win.skip_taskbar &&
                        // ignore wm_class == null + Gjs and
                        // are skip taskbar true
                        (meta_win.get_wm_class() !== null &&
                         !gnome_shell_wm_class) ||
                    default_isoverviewwindow_ws(win));
            };
        }
    }

    // Handle _getCaption errors
    if (GNOME_VERSION?.startsWith("3.36")) {
        // imports.ui.windowPreview is not in 3.36,
        // _getCaption() is still in workspace.js
        if (!default_getcaption_workspace) {
            default_getcaption_workspace = Workspace.prototype._getCaption;
            // 3.36 _getCaption
            Workspace.prototype._getCaption = function() {
                let metaWindow = this._windowClone.metaWindow;
                if (metaWindow.title)
                    return metaWindow.title;

                let tracker = Shell.WindowTracker.get_default();
                let app = tracker.get_window_app(metaWindow);
                return app ? app.get_name() : "";
            }
        }
    } else {
        const { WindowPreview } = imports.ui.windowPreview;
        if (!default_getcaption_windowpreview) {
            default_getcaption_windowpreview = WindowPreview.prototype._getCaption;
            log.debug(`override workspace._getCaption`);
            // 3.38 _getCaption
            WindowPreview.prototype._getCaption = function() {
                if (this.metaWindow.title)
                    return this.metaWindow.title;

                let tracker = Shell.WindowTracker.get_default();
                let app = tracker.get_window_app(this.metaWindow);
                return app ? app.get_name() : "";
            };
        }
    }

    // Handle the workspace thumbnail
    if (!default_isoverviewwindow_ws_thumbnail) {
        default_isoverviewwindow_ws_thumbnail =
            WorkspaceThumbnail.prototype._isOverviewWindow;
        WorkspaceThumbnail.prototype._isOverviewWindow = function (win: any) {
            let meta_win = win.get_meta_window();
            // wm_class Gjs needs to be skipped to prevent the ghost window in
            // workspace and overview
            let gnome_shell_wm_class = meta_win.get_wm_class() === "Gjs" ||
                meta_win.get_wm_class() === "Gnome-shell";
            let show_skiptb = !cfg.skiptaskbar_shall_hide(meta_win);
            return (show_skiptb && meta_win.skip_taskbar &&
                    // ignore wm_class == null + Gjs and
                    // are skip taskbar true
                    (meta_win.get_wm_class() !== null &&
                     !gnome_shell_wm_class)) ||
                default_isoverviewwindow_ws_thumbnail(win);
        };
    }

    // Handle switch-applications
    if (!default_init_appswitcher) {
        default_init_appswitcher = AppSwitcher.prototype._init;
        // Do not use the Shell.AppSystem apps
        AppSwitcher.prototype._init = function(_apps: any, altTabPopup: any) {
            // Simulate super._init(true);
            SwitcherList.prototype._init.call(this, true);
            this.icons = [];
            this._arrows = [];

            let windowTracker = Shell.WindowTracker.get_default();
            let settings = new Gio.Settings({ schema_id: 'org.gnome.shell.app-switcher' });

            let workspace = null;
            if (settings.get_boolean('current-workspace-only')) {
                let workspaceManager = global.workspace_manager;
                workspace = workspaceManager.get_active_workspace();
            }

            let allWindows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
            let allRunningSkipTaskbarApps = allWindows.filter((w,i,a) => {
                if (w) {
                    let found_idx: any;
                    // Find the first instance using wm_class
                    for (let index = 0; index < a.length; index++) {
                        if (a[index].get_wm_class() === w.get_wm_class()) {
                            found_idx = index;
                            break;
                        }
                    }
                    return found_idx == i;
                }
            });

            for (let i = 0; i < allRunningSkipTaskbarApps.length; i++) {
                let meta_win = allRunningSkipTaskbarApps[i];
                let show_skiptb = !cfg.skiptaskbar_shall_hide(meta_win);
                if (meta_win.is_skip_taskbar() && !show_skiptb) continue;
                let appIcon = new AppIcon(windowTracker.get_window_app(meta_win));
                appIcon.cachedWindows = allWindows.filter(
                    w => windowTracker.get_window_app(w) === appIcon.app);
                if (appIcon.cachedWindows.length > 0)
                    this._addIcon(appIcon);
            }

            this._curApp = -1;
            this._altTabPopup = altTabPopup;
            this._mouseTimeOutId = 0;

            this.connect('destroy', this._onDestroy.bind(this));
        }
    }

    // Handle switch-windows
    if (!default_getwindowlist_windowswitcher) {
        default_getwindowlist_windowswitcher = WindowSwitcherPopup.prototype._getWindowList;
        WindowSwitcherPopup.prototype._getWindowList = function() {
            let workspace = null;

            if (this._settings.get_boolean('current-workspace-only')) {
                let workspaceManager = global.workspace_manager;
                workspace = workspaceManager.get_active_workspace();
            }

            let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL,
                                                      workspace);
            return windows.map(w => {
                let show_skiptb = !cfg.skiptaskbar_shall_hide(w);
                let meta_window = w.is_attached_dialog() ? w.get_transient_for() : w;
                if (meta_window) {
                    if (!meta_window.is_skip_taskbar() ||
                        meta_window.is_skip_taskbar() && show_skiptb) {
                        return meta_window;
                    }
                }
                return null;
            }).filter((w, i, a) => w != null &&  a.indexOf(w) == i);
        }
    }
}

/**
 * This is the cleanup/restore of the decorator for skip_taskbar when pop-shell
 * is disabled.
 * Should only be called on extension#disable()
 *
 * Default functions should be checked if they exist,
 * especially when skip taskbar setting was left on during an update
 *
 */
function _hide_skip_taskbar_windows() {
    if (!GNOME_VERSION?.startsWith("40.")) {
        if (default_isoverviewwindow_ws)
            Workspace.prototype._isOverviewWindow = default_isoverviewwindow_ws;
    }

    if (GNOME_VERSION?.startsWith("3.36")) {
        if (default_getcaption_workspace)
            Workspace.prototype._getCaption = default_getcaption_workspace;
    } else {
        if (default_getcaption_windowpreview) {
            const { WindowPreview } = imports.ui.windowPreview;
            WindowPreview.prototype._getCaption =
                default_getcaption_windowpreview;
        }
    }

    if (default_isoverviewwindow_ws_thumbnail) {
        WorkspaceThumbnail.prototype._isOverviewWindow =
            default_isoverviewwindow_ws_thumbnail;
    }

    if (default_init_appswitcher)
        AppSwitcher.prototype._init = default_init_appswitcher;

    if (default_getwindowlist_windowswitcher) {
        WindowSwitcherPopup.prototype._getWindowList =
            default_getwindowlist_windowswitcher;
    }
}
