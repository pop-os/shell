const Me = imports.misc.extensionUtils.getCurrentExtension();

const Focus = Me.imports.focus;
const { Gio, GLib, Meta, Shell, St } = imports.gi;
const { bind } = imports.lang;
const { cursor_rect, log } = Me.imports.lib;
const { _defaultCssStylesheet, uiGroup, wm } = imports.ui.main;
const { Keybindings } = Me.imports.keybindings;
const { ShellWindow } = Me.imports.window;
const { WindowSearch } = Me.imports.window_search;
const Tags = Me.imports.tags;
const { Tiler } = Me.imports.tiling;
const { ExtensionSettings, Settings } = Me.imports.settings;
const { Storage, World, entity_eq } = Me.imports.ecs;

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

        this.grab_op = null;
        this.keybindings = new Keybindings(this);
        this.settings = new ExtensionSettings();
        this.overlay = new St.BoxLayout({ style_class: "tile-preview" });

        // Storages

        this.icons = this.register_storage();
        this.ids = this.register_storage();
        this.monitors = this.register_storage();
        this.names = this.register_storage();
        this.tilable = this.register_storage();
        this.windows = this.register_storage();

        // Dialogs

        this.window_search = new WindowSearch(this);

        // Systems

        this.focus_switcher = new Focus.FocusSwitcher(this);
        this.tiler = new Tiler(this);

        // Signals

        global.display.connect('window_created', (_, win) => this.on_window_create(win));
        global.display.connect('grab-op-begin', (_, _display, win, op) => this.on_grab_start(win, op));
        global.display.connect('grab-op-end', (_, _display, win, op) => this.on_grab_end(win, op));

        for (const window of this.tab_list(Meta.TabList.NORMAL, null)) {
            this.on_window_create(window);
        }
    }

    active_window_list() {
        let workspace = global.workspace_manager.get_active_workspace();
        return this.tab_list(Meta.TabList.NORMAL, workspace);
    }

    connect_window(win) {
        win.meta.connect('position-changed', () => this.on_window_changed(win, WINDOW_CHANGED_POSITION));
        win.meta.connect('size-changed', () => this.on_window_changed(win, WINDOW_CHANGED_SIZE));
    }

    focus_window() {
        return this.get_window(global.display.get_focus_window());
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
        this.tiler.set_gap(settings.gap());
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

    on_window_changed(win, event) {
        this.window_monitor_change(win);
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

    // Snaps all windows to the window grid
    snap_windows() {
        log(`snapping windows`);
        for (const window of this.windows.iter_values()) {
            if (window.is_tilable()) this.tiler.snap(window);
        }
    }

    tab_list(tablist, workspace) {
        return global.display.get_tab_list(tablist, workspace).map((win) => this.get_window(win));
    }

    tiled_windows() {
        return this.entities.filter((entity) => this.contains_tag(entity, Tags.Tiled));
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
            this.monitors.insert(entity, win.meta.get_monitor());

            log(`added window (${win.entity}): ${win.name()}`);
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
    * windows_at_pointer() {
        let cursor = cursor_rect();
        let monitor = global.display.get_monitor_index_for_rect(cursor);

        for (const entity of this.monitors.find((m) => m == monitor)) {
            let window = this.windows.with(entity, (window) => {
                return window.meta.get_frame_rect().contains_rect(cursor) ? window : null;
            });

            if (window) yield window;
        }
    }
}

var ext = null;

function init() {
    log("init");
}

function enable() {
    log("enable");

    load_theme();

    ext = new Ext();
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

    uiGroup.remove_actor(ext.overlay);

    ext.tiler.exit();

    ext.keybindings.disable(ext.keybindings.global)
        .disable(ext.keybindings.window_focus)

    ext = null;
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
