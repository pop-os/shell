const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as AutoTiler from 'auto_tiler';
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
import * as WindowSearch from 'window_search';

import type { Entity } from 'ecs';
import type { Rectangle } from 'rectangle';
import type { Indicator } from 'panel_settings';

const { Gio, GLib, Meta, St } = imports.gi;
const { cursor_rect, is_move_op } = Lib;
const { _defaultCssStylesheet, panel, uiGroup } = imports.ui.main;
const Tags = Me.imports.tags;

export class Ext extends Ecs.World {
    private init: boolean = true;
    private tiling: boolean = false;

    column_size: number = 128;
    row_size: number = 128;

    gap_inner_half: number = 0;
    gap_inner: number = 0;
    gap_outer_half: number = 0;
    gap_outer: number = 0;

    overlay: any;

    keybindings: Keybindings.Keybindings;
    settings: Settings.ExtensionSettings;
    focus_selector: Focus.FocusSelector;

    grab_op: GrabOp.GrabOp | null = null;
    last_focused: Entity | null = null;
    mode: number = Lib.MODE_DEFAULT;

    tiler: Tiling.Tiler;
    window_search: any;

    attached: Ecs.Storage<Entity> | null = null;
    icons: Ecs.Storage<any>;
    ids: Ecs.Storage<number>;
    monitors: Ecs.Storage<[number, number]>;
    names: Ecs.Storage<string>;
    snapped: Ecs.Storage<boolean>;
    tilable: Ecs.Storage<boolean>;
    windows: Ecs.Storage<Window.ShellWindow>;

    auto_tiler: AutoTiler.AutoTiler | null = null;

    signals: Array<any>;

    constructor() {
        super();

        // Misc

        this.set_gap_inner(8);
        this.set_gap_outer(8);
        this.keybindings = new Keybindings.Keybindings(this);
        this.overlay = new St.BoxLayout({ style_class: "tile-preview", visible: false });
        this.settings = new Settings.ExtensionSettings();
        this.signals = new Array();

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

        this.window_search = new WindowSearch.WindowSearch(this);

        // Systems

        this.focus_selector = new Focus.FocusSelector();
        this.tiler = new Tiling.Tiler(this);

        // Signals: We record these so that we may detach them

        const workspace_manager = global.display.get_workspace_manager();

        this.connect(global.display, 'window_created', (_: any, win: any) => this.on_window_create(win));
        this.connect(global.display, 'grab-op-begin', (_: any, _display: any, win: any, op: any) => this.on_grab_start(win, op));
        this.connect(global.display, 'grab-op-end', (_: any, _display: any, win: any, op: any) => this.on_grab_end(win, op));
        this.connect(workspace_manager, 'active-workspace-changed', () => {
            this.last_focused = null;
        });

        // Modes

        if (this.settings.tile_by_default()) {
            Log.info(`tile by default enabled`);
            this.mode = Lib.MODE_AUTO_TILE;
            this.attached = this.register_storage();

            this.auto_tiler = new AutoTiler.AutoTiler()
                .connect_on_attach((entity: Entity, window: Entity) => {
                    if (this.attached) {
                        Log.debug(`attached Window(${window}) to Fork(${entity})`);
                        this.attached.insert(window, entity);
                    }
                });
        }

        // Post-init

        for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
            this.on_window_create(window);
        }

        GLib.timeout_add(1000, GLib.PRIORITY_DEFAULT, () => {
            this.init = false;
            Log.debug(`init complete`);
            return false;
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

    /**
     * Swap window associations in the auto-tiler
     *
     * @param {Entity} a
     * @param {Entity} b
     *
     * Call this when a window has swapped positions with another, so that we
     * may update the associations in the auto-tiler world.
     */
    attach_swap(a: Entity, b: Entity) {
        if (this.attached && this.auto_tiler) {
            const a_ent = this.attached.remove(a);
            const b_ent = this.attached.remove(b);

            if (a_ent) {
                this.auto_tiler.forks.with(a_ent, (fork) => fork.replace_window(a, b));
                this.attached.insert(b, a_ent);
            }

            if (b_ent) {
                this.auto_tiler.forks.with(b_ent, (fork) => fork.replace_window(b, a));
                this.attached.insert(a, b_ent);
            }
        }
    }

    /**
     * Attaches `win` to an optionally-given monitor
     *
     * @param {ShellWindow} win The window to attach
     * @param {Number} monitor The index of the monitor to attach to
     */
    attach_to_monitor(win: Window.ShellWindow, workspace_id: [number, number]) {
        if (this.attached && this.auto_tiler) {
            let rect = this.monitor_work_area(workspace_id[0]);
            rect.x += this.gap_outer;
            rect.y += this.gap_outer;
            rect.width -= this.gap_outer * 2;
            rect.height -= this.gap_outer * 2;

            const [entity, fork] = this.auto_tiler.create_toplevel(win.entity, rect.clone(), workspace_id)
            this.attached.insert(win.entity, entity);

            Log.debug(`attached Window(${win.entity}) to Fork(${entity}) on Monitor(${workspace_id})`);

            this.attach_update(fork, rect, workspace_id);
            Log.info(this.auto_tiler.display(this, '\n\n'));
        }
    }

    /**
     * Tiles a window into another
     *
     * @param {ShellWindow} attachee The window to attach to
     * @param {ShellWindow} attacher The window to attach with
     */
    attach_to_window(attachee: Window.ShellWindow, attacher: Window.ShellWindow): boolean {
        if (this.auto_tiler) {
            Log.debug(`attempting to attach ${attacher.name(this)} to ${attachee.name(this)}`);

            let attached = this.auto_tiler.attach_window(this, attachee.entity, attacher.entity);

            if (attached) {
                const [_e, fork] = attached;
                const monitor = this.monitors.get(attachee.entity);
                if (monitor) {
                    if (fork.area) {
                        this.attach_update(fork, fork.area.clone(), monitor)
                    } else {
                        Log.error(`attaching to fork without an area`);
                    };
                    Log.info(this.auto_tiler.display(this, '\n\n'));
                    return true;
                } else {
                    Log.error(`missing monitor association for Window(${attachee.entity})`);
                }
            }

            Log.info(this.auto_tiler.display(this, '\n\n'));
        }

        return false;
    }

    /**
     * Sets the orientation of a tiling fork, and this it according to the given area.
     */
    attach_update(fork: AutoTiler.TilingFork, area: Rectangle, workspace: [number, number]) {
        Log.debug(`setting attach area to (${area.x},${area.y}), (${area.width},${area.height})`);
        this.tile(fork, area, workspace[1]);
    }

    tile(fork: AutoTiler.TilingFork, area: Rectangle, workspace: number) {
        if (this.auto_tiler) {
            this.tiling = true;
            fork.tile(this.auto_tiler, this, area, workspace);
            this.tiling = false;
        }
    }

    /**
     * Automatically tiles a window into the window tree.
     *
     * @param {ShellWindow} win The window to be tiled
     *
     * ## Implementation Notes
     *
     * - First tries to tile into the focused windowo
     * - Then tries to tile onto a monitor
     */
    auto_tile(win: Window.ShellWindow, ignore_focus: boolean = false) {
        if (!ignore_focus) {
            let onto = this.focus_window();

            if (onto && onto.is_tilable(this) && !Ecs.entity_eq(onto.entity, win.entity)) {
                this.detach_window(win.entity);

                if (this.attach_to_window(onto, win)) {
                    return;
                }
            }
        }

        this.auto_tile_on_workspace(win, this.workspace_id(win));
    }

    /**
     * Performed when a window that has been dropped is destined to be tiled
     *
     * @param {ShellWindow} win The window that was dropped
     *
     * ## Implementation Notes
     *
     * - If the window is dropped onto a window, tile onto it
     * - If no window is present, tile onto the monitor
     */
    auto_tile_on_drop(win: Window.ShellWindow) {
        if (this.attached && this.auto_tiler) {
            Log.debug(`dropped Window(${win.entity})`);
            if (this.dropped_on_sibling(win.entity)) return;

            const [cursor, monitor] = this.cursor_status();
            const workspace = this.active_workspace();

            let attach_to = null;
            for (const found of this.windows_at_pointer(cursor, monitor, workspace)) {
                if (found != win && this.attached.contains(found.entity)) {
                    attach_to = found;
                    break
                }
            }

            this.detach_window(win.entity);

            if (attach_to) {
                Log.debug(`found Window(${attach_to.entity}) at pointer`);
                this.attach_to_window(attach_to, win);
            } else {
                const toplevel = this.auto_tiler.find_toplevel([monitor, workspace]);
                if (toplevel) {
                    attach_to = this.auto_tiler.largest_window_on(this, toplevel);
                    if (attach_to) {
                        this.attach_to_window(attach_to, win);
                        return;
                    }
                }

                this.attach_to_monitor(win, this.workspace_id(win));
            }
        }
    }

    auto_tile_on_workspace(win: Window.ShellWindow, id: [number, number]) {
        if (this.auto_tiler) {
            Log.debug(`workspace id: ${id}`);
            const toplevel = this.auto_tiler.find_toplevel(id);

            if (toplevel) {
                Log.debug(`found toplevel at ${toplevel}`);
                const onto = this.auto_tiler.largest_window_on(this, toplevel);
                if (onto) {
                    Log.debug(`largest window = ${onto.entity}`);
                    if (this.attach_to_window(onto, win)) {
                        return;
                    }
                }

            }

            this.attach_to_monitor(win, id);
        }
    }

    /**
     * Connects a callback signal to a GObject, and records the signal.
     *
     * @param {GObject.Object} object
     * @param {string} property
     * @param {function} callback
     */
    connect(object: any, property: string, callback: any) {
        this.signals.push(object.connect(property, callback));
    }

    connect_window(win: Window.ShellWindow) {
        this.connect(win.meta, 'focus', () => this.on_focused(win));
        this.connect(win.meta, 'workspace-changed', () => this.on_workspace_changed(win));

        this.connect(win.meta, 'size-changed', () => {
            if (this.attached)  {
                Log.debug(`size changed: ${win.name(this)}`);
                if (this.grab_op) {

                } else if (!this.tiling) {
                    this.reflow(win.entity);
                }
            }
        });

        this.connect(win.meta, 'position-changed', () => {
            if (this.attached && !this.grab_op && !this.tiling) {
                Log.debug(`position changed: ${win.name(this)}`);
                this.reflow(win.entity);
            }
        });
    }

    /**
     * Detaches the window from a tiling branch, if it is attached to one.
     *
     * @param {Entity} win
     */
    detach_window(win: Entity) {
        if (this.attached) {
            this.attached.take_with(win, (prev_fork: Entity) => {
                if (this.auto_tiler) {
                    const reflow_fork = this.auto_tiler.detach(prev_fork, win);

                    if (reflow_fork) {
                        Log.debug(`found reflow_fork`);
                        const fork = reflow_fork[1];
                        if (fork.area) {
                            Log.debug(`begin tiling`);
                            this.tile(fork, fork.area, fork.workspace);
                        };
                    }

                    Log.info(this.auto_tiler.display(this, '\n\n'));
                }
            });
        }
    }

    /**
     * Swaps the location of two windows if the dropped window was dropped onto its sibling
     *
     * @param {Entity} win
     *
     * @return bool
     */
    dropped_on_sibling(win: Entity): boolean {
        if (this.attached && this.auto_tiler) {
            const fork_entity = this.attached.get(win);

            if (fork_entity) {
                const cursor = cursor_rect();
                const fork = this.auto_tiler.forks.get(fork_entity);

                if (fork && fork.area) {
                    if (fork.left.kind == AutoTiler.NodeKind.WINDOW && fork.right && fork.right.kind == AutoTiler.NodeKind.WINDOW) {
                        if (fork.left.is_window(win)) {
                            const sibling = this.windows.get(fork.right.entity);
                            if (sibling && sibling.rect().contains(cursor)) {
                                Log.debug(`${this.names.get(win)} was dropped onto ${sibling.name(this)}`);
                                fork.left.entity = fork.right.entity;
                                fork.right.entity = win;
                                this.tile(fork, fork.area, fork.workspace);
                                return true;
                            }
                        } else if (fork.right.is_window(win)) {
                            const sibling = this.windows.get(fork.left.entity);
                            if (sibling && sibling.rect().contains(cursor)) {
                                Log.debug(`${this.names.get(win)} was dropped onto ${sibling.name(this)}`);
                                fork.right.entity = fork.left.entity;
                                fork.left.entity = win;

                                this.tile(fork, fork.area, fork.workspace);
                                return true;
                            }
                        }
                    }
                }
            }
        }

        return false;
    }

    focus_window(): Window.ShellWindow | null {
        let focused = this.get_window(global.display.get_focus_window())
        if (!focused && this.last_focused) {
            focused = this.windows.get(this.last_focused);
        }
        return focused;
    }

    /// Fetches the window component from the entity associated with the metacity window metadata.
    get_window(meta: any): Window.ShellWindow | null {
        let entity = this.window_entity(meta);
        return entity ? this.windows.get(entity) : null;
    }

    load_settings() {
        this.set_gap_inner(this.settings.gap_inner())
        this.set_gap_outer(this.settings.gap_outer());
        this.column_size = this.settings.column_size();
        this.row_size = this.settings.row_size();
    }

    monitor_work_area(monitor: number): Rectangle {
        const meta = global.display.get_workspace_manager()
            .get_active_workspace()
            .get_work_area_for_monitor(monitor);

        return Rect.Rectangle.from_meta(meta);
    }

    on_destroy(win: Window.ShellWindow) {
        Log.debug(`destroying window (${win.entity}): ${win.name(this)}`);

        if (this.auto_tiler) this.detach_window(win.entity);

        this.delete_entity(win.entity);
    }

    /**
     * Triggered when a window has been focused
     *
     * @param {ShellWindow} win
     */
    on_focused(win: Window.ShellWindow) {
        this.last_focused = win.entity;

        let msg = `focused Window(${win.entity}) {\n`
            + `  name: ${win.name(this)},\n`
            + `  rect: ${win.rect().fmt()},\n`
            + `  wm_class: "${win.meta.get_wm_class()}",\n`;

        if (this.attached) {
            msg += `  fork: (${this.attached.get(win.entity)}),\n`;
        }

        Log.info(msg + '}');
    }

    /**
     * Triggered when a grab operation has been ended
     *
     * @param {Meta.Window} meta
     * @param {*} op
     */
    on_grab_end(meta: any, op: any) {
        let win = this.get_window(meta);

        if (null == win || !win.is_tilable(this)) {
            return;
        }

        if (win && this.grab_op && Ecs.entity_eq(this.grab_op.entity, win.entity)) {
            let crect = win.rect()

            if (this.mode == Lib.MODE_AUTO_TILE) {
                const rect = this.grab_op.rect;
                if (is_move_op(op)) {
                    Log.debug(`win: ${win.name(this)}; op: ${op}; from (${rect.x},${rect.y}) to (${crect.x},${crect.y})`);

                    this.on_monitor_changed(win, (changed_from: number, changed_to: number, workspace: number) => {
                        if (win) {
                            Log.debug(`window ${win.name(this)} moved from display ${changed_from} to ${changed_to}`);
                            this.monitors.insert(win.entity, [changed_to, workspace]);
                        }
                    });

                    if (rect.x != crect.x || rect.y != crect.y) {
                        if (rect.contains(cursor_rect())) {
                            this.reflow(win.entity);
                        } else {
                            this.auto_tile_on_drop(win);
                        }
                    }
                } else if (this.attached && this.auto_tiler) {
                    const fork = this.attached.get(win.entity);
                    if (fork) {
                        const movement = this.grab_op.operation(crect);

                        Log.debug(`resizing window: from [${rect.fmt()} to ${crect.fmt()}]`);
                        this.auto_tiler.resize(this, fork, win.entity, movement, crect);
                        Log.debug(`changed to: ${this.auto_tiler.display(this, '')}`);
                    } else {
                        Log.error(`no fork found`);
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
    on_grab_start(meta: any, op: any) {
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
        func: (exp_mon: number, act_mon: number, act_work: number) => void
    ) {
        const monitor = this.monitors.get(win.entity);
        if (monitor) {
            const [expected_monitor, expected_workspace] = monitor;
            const actual_monitor = win.meta.get_monitor();
            const actual_workspace = win.meta.get_workspace().index();
            if (expected_monitor != actual_monitor || actual_workspace != expected_workspace) {
                func(expected_monitor, actual_monitor, actual_workspace);
            }
        }
    }

    on_window_create(window: any) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            let win = this.get_window(window);
            let actor = window.get_compositor_private();
            if (win && actor) {
                actor.connect('destroy', () => {
                    if (win) this.on_destroy(win);
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
            const id = this.workspace_id(win);
            const prev_id = this.monitors.get(win.entity);
            if (!prev_id || id[0] != prev_id[0] || id[1] != prev_id[1]) {
                Log.debug(`workspace changed from (${prev_id}) to (${id})`);
                this.monitors.insert(win.entity, id);
                this.detach_window(win.entity);
                this.auto_tile_on_workspace(win, id);
            }
        }
    }

    reflow(win: Entity) {
        if (this.attached) this.attached.with(win, (fork_entity) => {
            Log.debug(`scheduling reflow of Window(${win})`);
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this.auto_tiler) {
                    Log.debug(`reflow Window(${win})`);
                    const fork = this.auto_tiler.forks.get(fork_entity);
                    if (fork?.area) this.tile(fork, fork.area, fork.workspace);
                }
            });
        });
    }

    set_gap_inner(gap: number) {
        this.gap_inner = gap - (gap % 4);
        this.gap_inner_half = this.gap_inner / 2;
    }

    set_gap_outer(gap: number) {
        this.gap_outer = gap - (gap % 4);
        this.gap_outer_half = this.gap_outer / 2;
    }

    set_overlay(rect: Rectangle) {
        this.overlay.x = rect.x;
        this.overlay.y = rect.y;
        this.overlay.width = rect.width;
        this.overlay.height = rect.height;
    }

    // Snaps all windows to the window grid
    snap_windows() {
        for (const window of this.windows.values()) {
            if (window.is_tilable(this)) this.tiler.snap(this, window);
        }
    }

    tab_list(tablist: number, workspace: number | null): Array<Window.ShellWindow> {
        return global.display
            .get_tab_list(tablist, workspace)
            .map((win: any) => this.get_window(win));
    }

    * tiled_windows(): IterableIterator<Entity> {
        for (const entity of this.entities()) {
            if (this.contains_tag(entity, Tags.Tiled)) {
                yield entity;
            }
        }
    }

    toggle_orientation() {
        if (!this.auto_tiler) return;
        const focused = this.focus_window();
        if (!focused) return;

        if (this.attached) this.attached.with(focused.entity, (fork_entity) => {
            this.auto_tiler?.forks.with(fork_entity, (fork) => {
                if (this.auto_tiler) {
                    fork.toggle_orientation();

                    for (const child of this.auto_tiler.iter(fork_entity, AutoTiler.NodeKind.FORK)) {
                        this.auto_tiler.forks.with(child.entity, (fork) => {
                            fork.toggle_orientation();
                        });
                    }

                    if (fork.area) this.tile(fork, fork.area, fork.workspace);
                }
            });
        });
    }

    update_snapped() {
        for (const entity of this.snapped.find((val) => val)) {
            const window = this.windows.get(entity);
            if (window) this.tiler.snap(this, window);
        }
    }

    /// Fetches the window entity which is associated with the metacity window metadata.
    window_entity(meta: any): Entity | null {
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
            this.monitors.insert(entity, [win.meta.get_monitor(), win.meta.get_workspace().index()]);

            Log.debug(`created window (${win.entity}): ${win.name(this)}: ${id}`);
            if (this.mode == Lib.MODE_AUTO_TILE && win.is_tilable(this)) this.auto_tile(win, this.init);
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

        let id: [number, number] = [0, 0];

        if (window) {
            id[0] = window.meta.get_monitor();
            id[1] = window.meta.get_workspace().index();
        } else {
            id[0] = this.active_monitor();
            id[1] = this.active_workspace();
        }

        Log.debug(`found workspace ID: ${id}`);

        return id;
    }
}

let ext: Ext | null = null;
let indicator: Indicator | null = null;

function init() {
    Log.info("init");

    ext = new Ext();

    // Code to execute after the shell has finished initializing everything.
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
        if (ext?.mode == Lib.MODE_DEFAULT) ext.snap_windows();
        return false;
    });
}

function enable() {
    if (ext) {
        Log.info("enable");

        load_theme();

        uiGroup.add_actor(ext.overlay);

        if (!indicator) {
            indicator = new PanelSettings.Indicator(ext);
            panel.addToStatusArea('pop-shell', indicator.button);
        }

        ext.keybindings.enable(ext.keybindings.global)
            .enable(ext.keybindings.window_focus);
    }
}

function disable() {
    Log.info("disable");

    if (indicator) {
        indicator.button.destroy();
        indicator = null;
    }

    if (ext) {
        ext.tiler.exit(ext);

        uiGroup.remove_actor(ext.overlay);

        ext.keybindings.disable(ext.keybindings.global)
            .disable(ext.keybindings.window_focus)
    }
}

// Supplements the GNOME Shell theme with the extension's theme.
function load_theme() {
    try {
        let theme = new St.Theme({
            application_stylesheet: Gio.File.new_for_path(Me.path + "/stylesheet.css"),
            theme_stylesheet: _defaultCssStylesheet,
        });

        St.ThemeContext.get_for_stage(global.stage).set_theme(theme);
    } catch (e) {
        Log.debug("stylesheet: " + e);
    }
}
