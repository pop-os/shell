const Me = imports.misc.extensionUtils.getCurrentExtension();

const Focus = Me.imports.focus;
const { Gio, GLib, Meta, Shell, St } = imports.gi;
const { bind } = imports.lang;
const Lib = Me.imports.lib;
const { ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL, fmt_rect, ok, ok_or_else, cursor_rect, is_move_op, log } = Lib;
const { _defaultCssStylesheet, panel, uiGroup, wm } = imports.ui.main;
const { Keybindings } = Me.imports.keybindings;
const { ShellWindow } = Me.imports.window;
const { WindowSearch } = Me.imports.window_search;
const Tags = Me.imports.tags;
const { FORK, WINDOW, AutoTiler, TilingFork, TilingNode } = Me.imports.auto_tiler;
const { Tiler } = Me.imports.tiling;
const { ExtensionSettings, Settings } = Me.imports.settings;
const { Storage, World, entity_eq } = Me.imports.ecs;
const { Indicator } = Me.imports.panel_settings;
const { GrabOp } = Me.imports.grab_op;

const WINDOW_CHANGED_POSITION = 0;
const WINDOW_CHANGED_SIZE = 1;

var Ext = class Ext extends World {
    constructor() {
        super();

        // Misc

        this.init = true;
        this.column_size = 128;
        this.set_gap_inner(8);
        this.set_gap_outer(8);
        this.grab_op = null;
        this.keybindings = new Keybindings(this);
        this.last_focused = null;
        this.mode = Lib.MODE_DEFAULT;
        this.overlay = new St.BoxLayout({ style_class: "tile-preview", visible: false });
        this.row_size = 128;
        this.settings = new ExtensionSettings();
        this.signals = new Array();

        this.load_settings();

        // Storages

        this.attached = null;
        this.icons = this.register_storage();
        this.ids = this.register_storage();
        this.monitors = this.register_storage();
        this.names = this.register_storage();
        this.tilable = this.register_storage();
        this.windows = this.register_storage();
        this.snapped = this.register_storage();

        // Sub-worlds

        this.auto_tiler = null;

        // Dialogs

        this.window_search = new WindowSearch(this);

        // Systems

        this.focus_selector = new Focus.FocusSelector(this);
        this.tiler = new Tiler(this);

        // Signals: We record these so that we may detach them

        const workspace_manager = global.display.get_workspace_manager();

        this.connect(global.display, 'window_created', (_, win) => this.on_window_create(win));
        this.connect(global.display, 'grab-op-begin', (_, _display, win, op) => this.on_grab_start(win, op));
        this.connect(global.display, 'grab-op-end', (_, _display, win, op) => this.on_grab_end(win, op));
        this.connect(workspace_manager, 'active-workspace-changed', () => {
            this.last_focused = null;
        });

        // Modes

        if (this.settings.tile_by_default()) {
            log(`tile by default enabled`);
            this.mode = Lib.MODE_AUTO_TILE;
            this.attached = this.register_storage();

            this.auto_tiler = new AutoTiler()
                .connect_on_attach((entity, window) => {
                    log(`attached Window(${window}) to Fork(${entity})`);
                    this.attached.insert(window, entity);
                });
        }

        // Post-init

        for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
            this.on_window_create(window);
        }

        GLib.timeout_add(1000, GLib.PRIORITY_DEFAULT, () => {
            this.init = false;
            log(`init complete`);
            return false;
        });
    }

    activate_window(window) {
        ok(window, (win) => win.activate());
    }

    active_monitor() {
        return global.display.get_current_monitor();
    }

    active_window_list() {
        let workspace = global.workspace_manager.get_active_workspace();
        return this.tab_list(Meta.TabList.NORMAL, workspace);
    }

    active_workspace() {
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
    attach_swap(a, b) {
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

    /**
     * Attaches `win` to an optionally-given monitor
     *
     * @param {ShellWindow} win The window to attach
     * @param {Number} monitor The index of the monitor to attach to
     */
    attach_to_monitor(win, workspace_id) {
        const [entity, fork] = this.auto_tiler.create_toplevel(win.entity, workspace_id)
        this.attached.insert(win.entity, entity);

        log(`attached Window(${win.entity}) to Fork(${entity}) on Monitor(${workspace_id})`);

        this.attach_update(fork, this.monitor_work_area(workspace_id[0]), workspace_id[1]);
        log(this.auto_tiler.display('\n\n'));
    }

    /**
     * Tiles a window into another
     *
     * @param {ShellWindow} attachee The window to attach to
     * @param {ShellWindow} attacher The window to attach with
     */
    attach_to_window(attachee, attacher) {
        log(`attempting to attach ${attacher.name()} to ${attachee.name()}`);

        let result = this.auto_tiler.attach_window(attachee.entity, attacher.entity);

        if (result) {
            const [_e, fork] = result;
            const [_, workspace] = this.monitors.get(attachee.entity);
            this.attach_update(fork, attachee.meta.get_frame_rect(), workspace);
            log(this.auto_tiler.display('\n\n'));
            return true;
        }

        log(this.auto_tiler.display('\n\n'));

        return false;
    }

    /**
     * Sets the orientation of a tiling fork, and this it according to the given area.
     *
     * @param {TilingFork} fork The fork that needs to be retiled
     * @param {[u32, 4]} area The area to tile with
     */
    attach_update(fork, area, workspace) {
        log(`setting attach area to (${area.x},${area.y}), (${area.width},${area.height})`);
        fork.set_orientation(area.width > area.height ? ORIENTATION_HORIZONTAL : ORIENTATION_VERTICAL);
        this.tile(fork, [area.x, area.y, area.width, area.height], workspace);
    }

    tile(fork, area, workspace) {
        this.tiling = true;
        fork.tile(this.auto_tiler, this, area, workspace);
        this.tiling = false;
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
    auto_tile(win, ignore_focus=false) {
        if (!ignore_focus) {
            let onto = this.focus_window();

            if (onto && onto.is_tilable() && !entity_eq(onto.entity, win.entity)) {
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
    auto_tile_on_drop(win) {
        log(`dropped Window(${win.entity})`);
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
            log(`found Window(${attach_to.entity}) at pointer`);
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

    auto_tile_on_workspace(win, id) {
        log(`workspace id: ${id}`);
        const toplevel = this.auto_tiler.find_toplevel(id);

        if (toplevel) {
            log(`found toplevel at ${toplevel}`);
            const onto = this.auto_tiler.largest_window_on(this, toplevel);
            log(`largest window = ${onto.entity}`);
            if (onto && this.attach_to_window(onto, win)) {
                return;
            }
        }

        this.attach_to_monitor(win, id);
    }

    /**
     * Connects a callback signal to a GObject, and records the signal.
     *
     * @param {GObject.Object} object
     * @param {string} property
     * @param {function} callback
     */
    connect(object, property, callback) {
        this.signals.push(object.connect(property, callback));
    }

    connect_window(win) {
        this.connect(win.meta, 'focus', () => this.on_focused(win));
        this.connect(win.meta, 'workspace-changed', () => this.on_workspace_changed(win));

        this.connect(win.meta, 'size-changed', () => {
            if (this.attached)  {
                log(`size changed: ${win.name()}`);
                if (this.grab_op) {

                } else if (!this.tiling) {
                    this.reflow(win.entity);
                }
            }
        });

        this.connect(win.meta, 'position-changed', () => {
            if (this.attached && !this.grab_op && !this.tiling) {
                log(`position changed: ${win.name()}`);
                this.reflow(win.entity);
            }
        });
    }

    /**
     * Detaches the window from a tiling branch, if it is attached to one.
     *
     * @param {Entity} win
     */
    detach_window(win) {
        this.attached.take_with(win, (prev_fork) => {
            const reflow_fork = this.auto_tiler.detach(prev_fork, win);

            log(this.auto_tiler.display('\n\n'));

            if (reflow_fork) {
                const fork = reflow_fork[1];
                this.tile(fork, fork.area, fork.workspace);
            }
        });
    }

    /**
     * Swaps the location of two windows if the dropped window was dropped onto its sibling
     *
     * @param {Entity} win
     *
     * @return bool
     */
    dropped_on_sibling(win) {
        const fork_entity = this.attached.get(win);

        if (fork_entity) {
            const cursor = cursor_rect();
            const fork = this.auto_tiler.forks.get(fork_entity);

            if (fork.left.kind == WINDOW && fork.right && fork.right.kind == WINDOW) {
                if (fork.left.is_window(win)) {
                    const sibling = this.windows.get(fork.right.entity);
                    if (sibling.meta.get_frame_rect().contains_rect(cursor)) {
                        log(`${this.names.get(win)} was dropped onto ${sibling.name()}`);
                        fork.left.entity = fork.right.entity;
                        fork.right.entity = win;
                        this.tile(fork, fork.area, fork.workspace);
                        return true;
                    }
                } else if (fork.right.is_window(win)) {
                    const sibling = this.windows.get(fork.left.entity);
                    if (sibling.meta.get_frame_rect().contains_rect(cursor)) {
                        log(`${this.names.get(win)} was dropped onto ${sibling.name()}`);
                        fork.right.entity = fork.left.entity;
                        fork.left.entity = win;

                        this.tile(fork, fork.area, fork.workspace);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    focus_window() {
        let focused = this.get_window(global.display.get_focus_window())
        if (!focused && this.last_focused) {
            focused = this.windows.get(this.last_focused);
        }
        return focused;
    }

    /// Fetches the window component from the entity associated with the metacity window metadata.
    get_window(meta) {
        // TODO: Deprecate this
        let entity = this.window(meta);
        return entity ? this.windows.get(entity) : null;
    }

    load_settings() {
        this.set_gap_inner(this.settings.gap_inner())
        this.set_gap_outer(this.settings.gap_outer());
        this.column_size = this.settings.column_size();
        this.row_size = this.settings.row_size();
    }

    monitor_work_area(monitor) {
        return global.display.get_workspace_manager()
            .get_active_workspace()
            .get_work_area_for_monitor(monitor)
    }

    on_destroy(win) {
        log(`destroying window (${win.entity}): ${win.name()}`);

        if (this.auto_tiler) this.detach_window(win.entity);

        this.delete_entity(win.entity);
    }

    /**
     * Triggered when a window has been focused
     *
     * @param {ShellWindow} win
     */
    on_focused(win) {
        this.last_focused = win.entity;

        let msg = `focused Window(${win.entity}) {\n`
            + `  name: ${win.name()},\n`
            + `  rect: ${fmt_rect(win.meta.get_frame_rect())},\n`
            + `  wm_class: "${win.meta.get_wm_class()}",\n`;

        if (this.attached) {
            msg += `  fork: (${this.attached.get(win.entity)}),\n`;
        }

        log(msg + '}');
    }

    /**
     * Triggered when a grab operation has been ended
     *
     * @param {Meta.Window} meta
     * @param {*} op
     */
    on_grab_end(meta, op) {
        let win = this.get_window(meta);

        if (null == win || !win.is_tilable()) {
            return;
        }

        if (win && this.grab_op && entity_eq(this.grab_op.entity, win.entity)) {
            let crect = win.meta.get_frame_rect()

            if (this.mode == Lib.MODE_AUTO_TILE) {
                const rect = this.grab_op.rect;
                if (is_move_op(op)) {
                    log(`win: ${win.name()}; op: ${op}; from (${rect.x},${rect.y}) to (${crect.x},${crect.y})`);

                    this.on_monitor_changed(win, (changed_from, changed_to, workspace) => {
                        log(`window ${win.name()} moved from display ${changed_from} to ${changed_to}`);
                        this.monitors.insert(win.entity, [changed_to, workspace]);
                    });

                    if (rect.x != crect.x || rect.y != crect.y) {
                        if (rect.contains_rect(cursor_rect())) {
                            this.reflow(win.entity);
                        } else {
                            this.auto_tile_on_drop(win);
                        }
                    }
                } else {
                    const fork = this.attached.get(win.entity);
                    if (fork) {
                        const movement = this.grab_op.operation(crect);

                        log(`resizing window: from [${fmt_rect(rect)} to ${fmt_rect(crect)}]`);
                        this.auto_tiler.resize(this, fork, win.entity, movement, crect);
                        log(`changed to: ${this.auto_tiler.display('')}`);
                    } else {
                        log(`no fork found`);
                    }
                }
            } else {
                this.tiler.snap(win);
            }
        } else {
            log(`mismatch on grab op entity`);
        }

        this.grab_op = null;
    }

    /**
     * Triggered when a grab operation has been started
     *
     * @param {Meta.Window} meta
     * @param {*} op
     */
    on_grab_start(meta, op) {
        let win = this.get_window(meta);
        if (win && win.is_tilable()) {
            let entity = win.entity;
            log(`grabbed Window(${entity}): ${this.names.get(entity)}`);
            let rect = meta.get_frame_rect();
            this.grab_op = new GrabOp(entity, rect);
        }
    }

    /// Handles the event of a window moving from one monitor to another.
    on_monitor_changed(win, func) {
        let [expected_monitor, expected_workspace] = this.monitors.get(win.entity);
        let actual_monitor = win.meta.get_monitor();
        let actual_workspace = win.meta.get_workspace().index();
        if (expected_monitor != actual_monitor || actual_workspace != expected_workspace) {
            func(expected_monitor, actual_monitor, actual_workspace);
        }
    }

    on_window_create(window) {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            let win = this.get_window(window);
            let actor = window.get_compositor_private();
            if (win && actor) {
                actor.connect('destroy', () => this.on_destroy(win));

                if (win.is_tilable()) {
                    this.connect_window(win);
                }
            }

            return false;
        });
    }

    on_workspace_changed(win) {
        if (!this.grab_op) {
            log(`workspace changed for ${win.name()}`);
            const id = this.workspace_id(win);
            const prev_id = this.monitors.get(win.entity);

            if (id[0] != prev_id[0] || id[1] != prev_id[1]) {
                this.monitors.insert(win.entity, id);
                this.detach_window(win.entity);
                this.auto_tile_on_workspace(win, id);
            }
        }
    }

    reflow(win) {
        this.attached.with(win, (fork_entity) => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                const fork = this.auto_tiler.forks.get(fork_entity);
                this.tile(fork, fork.area, fork.workspace);
            });
        });
    }

    set_gap_inner(gap) {
        this.gap_inner = gap - (gap % 4);
        this.gap_inner_half = this.gap_inner / 2;
    }

    set_gap_outer(gap) {
        this.gap_outer = gap - (gap % 4);
        this.gap_outer_half = this.gap_outer / 2;
    }

    set_overlay(rect) {
        this.overlay.x = rect.x;
        this.overlay.y = rect.y;
        this.overlay.width = rect.width;
        this.overlay.height = rect.height;
    }

    // Snaps all windows to the window grid
    snap_windows() {
        for (const window of this.windows.values()) {
            if (window.is_tilable()) this.tiler.snap(window);
        }
    }

    tab_list(tablist, workspace) {
        return global.display.get_tab_list(tablist, workspace).map((win) => this.get_window(win));
    }

    tiled_windows() {
        return this.entities.filter((entity) => this.contains_tag(entity, Tags.Tiled));
    }

    toggle_orientation() {
        if (!this.auto_tiler) return;
        const focused = this.focus_window();
        if (!focused) return;

        this.attached.with(focused.entity, (fork_entity) => {
            this.auto_tiler.forks.with(fork_entity, (fork) => {
                fork.toggle_orientation();

                for (const child of this.auto_tiler.iter(fork_entity, FORK)) {
                    this.auto_tiler.forks.get(child.entity).toggle_orientation();
                }

                this.tile(fork, fork.area, fork.workspace);
            });
        });
    }

    update_snapped() {
        for (const entity of ext.snapped.find((val) => val)) {
            const window = ext.windows.get(entity);
            ext.tiler.snap(window);
        }
    }

    /// Fetches the window entity which is associated with the metacity window metadata.
    window(meta) {
        if (!meta) return null;

        let id = meta.get_stable_sequence();

        // Locate the window entity with the matching ID
        let entity = this.ids.find((comp) => comp == id).next().value;

        // If not found, create a new entity with a ShellWindow component.
        if (!entity) {
            entity = this.create_entity();

            let win = new ShellWindow(entity, meta, this);

            this.windows.insert(entity, win);
            this.ids.insert(entity, id);
            this.monitors.insert(entity, [win.meta.get_monitor(), win.meta.get_workspace().index()]);

            log(`created window (${win.entity}): ${win.name()}: ${id}`);
            if (this.mode == Lib.MODE_AUTO_TILE && win.is_tilable()) this.auto_tile(win, this.init);
        }

        return entity;
    }

    /// Returns the window(s) that the mouse pointer is currently hoving above.
    * windows_at_pointer(cursor, monitor, workspace) {
        for (const entity of this.monitors.find((m) => m[0] == monitor && m[1] == workspace)) {
            let window = this.windows.with(entity, (window) => {
                return window.meta.get_frame_rect().contains_rect(cursor) ? window : null;
            });

            if (window) yield window;
        }
    }

    cursor_status() {
        let cursor = cursor_rect();
        let monitor = global.display.get_monitor_index_for_rect(cursor);
        return [cursor, monitor];
    }

    workspace_id(window = null) {
        log(`fetching workspace ID`);
        if (window) {
            var id = [window.meta.get_monitor(), window.meta.get_workspace().index()];
        } else {
            var id = [this.active_monitor(), this.active_workspace()];
        }

        log(`found ID of ${id}`);

        return id;
    }
}

let ext;
let indicator;

function init() {
    log("init");

    ext = new Ext();
    uiGroup.add_actor(ext.overlay);

    // Code to execute after the shell has finished initializing everything.
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
        if (ext.mode == Lib.MODE_DEFAULT) ext.snap_windows();
        return false;
    });
}

function enable() {
    log("enable");

    load_theme();

    if (!indicator) {
        indicator = new Indicator(ext);
        panel.addToStatusArea('pop-shell', indicator);
    }

    uiGroup.add_actor(ext.overlay);

    ext.keybindings.enable(ext.keybindings.global)
        .enable(ext.keybindings.window_focus);
}

function disable() {
    log("disable");

    if (indicator) {
        indicator.destroy();
        indicator = null;
    }

    if (ext) {
        uiGroup.remove_actor(ext.overlay);

        ext.tiler.exit();

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
        log("stylesheet: " + e);
    }
}
