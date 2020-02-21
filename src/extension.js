const Me = imports.misc.extensionUtils.getCurrentExtension();

const Focus = Me.imports.focus;
const { Gio, GLib, Meta, Shell, St } = imports.gi;
const { bind } = imports.lang;
const { ok, cursor_rect, log } = Me.imports.lib;
const { _defaultCssStylesheet, uiGroup, wm } = imports.ui.main;
const { Keybindings } = Me.imports.keybindings;
const { ShellWindow } = Me.imports.window;
const { WindowSearch } = Me.imports.window_search;
const Tags = Me.imports.tags;
const { Tiler } = Me.imports.tiling;
const { ExtensionSettings, Settings } = Me.imports.settings;
const { Storage, World, entity_eq } = Me.imports.ecs;
const { Indicator } = Me.imports.panel_settings;

const WINDOW_CHANGED_POSITION = 0;
const WINDOW_CHANGED_SIZE = 1;

var GrabOp = class GrabOp {
    constructor(entity, xpos, ypos) {
        this.entity = entity;
        this.xpos = xpos;
        this.ypos = ypos;
    }

    pos() {
        return [this.xpos, this.ypos];
    }
}

var Ext = class Ext extends World {
    constructor() {
        super();

        // Misc

        this.column_size = 128;
        this.set_gap_inner(8);
        this.set_gap_outer(8);
        this.grab_op = null;
        this.keybindings = new Keybindings(this);
        this.last_focused = null;
        this.overlay = new St.BoxLayout({ style_class: "tile-preview", visible: false });
        this.row_size = 128;
        this.settings = new ExtensionSettings();
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

        this.window_search = new WindowSearch(this);

        // Systems

        this.focus_selector = new Focus.FocusSelector(this);
        this.tiler = new Tiler(this);

        // Signals: We record these so that we may detach them

        this.connect(global.display, 'window_created', (_, win) => this.on_window_create(win));
        this.connect(global.display, 'grab-op-begin', (_, _display, win, op) => this.on_grab_start(win, op));
        this.connect(global.display, 'grab-op-end', (_, _display, win, op) => this.on_grab_end(win, op));

        // Post-init

        for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
            this.on_window_create(window);
        }
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
        win.meta.connect('position-changed', () => this.on_window_changed(win, WINDOW_CHANGED_POSITION));
        win.meta.connect('size-changed', () => this.on_window_changed(win, WINDOW_CHANGED_SIZE));

        this.connect(win.meta, 'focus', () => this.on_focused(win));
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

    /// Finds the largest window on a monitor.
    largest_window_on(monitor) {
        let largest = null;
        let largest_size = 0;

        for (const entity of this.monitors.find((m) => m == monitor)) {
            this.windows.with(entity, (window) => {
                let rect = window.meta.get_frame_rect();
                let window_size = rect.width * rect.height;
                if (largest_size < window_size) {
                    largest = window;
                    largest_size = window_size;
                }
            });
        }

        return largest;
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

        this.delete_entity(win.entity);
    }

    /**
     * Triggered when a window has been focused
     *
     * @param {ShellWindow} win
     */
    on_focused(win) {
        let msg = `focused Window(${win.entity}) {\n`
            + `  name: ${win.name()},\n`
            + `  rect: ${fmt_rect(win.meta.get_frame_rect())},\n`
            + `  wm_class: "${win.meta.get_wm_class()}",\n`;

        log(msg + '}');
    }

    on_grab_end(meta, op) {
        let win = this.get_window(meta);

        if (win && this.grab_op && entity_eq(this.grab_op.entity, win.entity)) {
            let opos = this.grab_op.pos();
            let crect = win.meta.get_frame_rect()

            if (opos != [crect.x, crect.y]) {
                log(`win: ${win.name()}; op: ${op}; from (${opos[0]},${opos[1]}) to (${crect.x},${crect.y})`);
                this.tiler.snap(win);
            }
        }
    }

    on_grab_start(meta, op) {
        let win = this.window(meta);
        if (win) {
            let rect = meta.get_frame_rect();
            this.grab_op = new GrabOp(win, rect.x, rect.y);
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
        log(`snapping windows`);
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
        }

        return entity;
    }

    /// Handles the event of a window moving from one monitor to another.
    window_monitor_change(win) {
        let expected_monitor = this.monitors.get(win.entity);
        let actual_monitor = win.meta.get_monitor();
        if (expected_monitor != actual_monitor) {
            log(`window ${win.name()} moved from display ${expected_monitor} to ${actual_monitor}`);
            this.monitors.insert(win.entity, actual_monitor);
        }
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
}

let ext;
let indicator;

function init() {
    log("init");
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
        .enable(ext.keybindings.window_focus)

    // Code to execute after the shell has finished initializing everything.
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
        ext.snap_windows();
        return false;
    });
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
