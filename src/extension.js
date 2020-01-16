const Me = imports.misc.extensionUtils.getCurrentExtension();

const Mainloop = imports.mainloop;
const Focus = Me.imports.focus;
const { Gio, Meta, Shell, St } = imports.gi;
const { bind } = imports.lang;
const { log } = Me.imports.lib;
const { _defaultCssStylesheet, uiGroup, wm } = imports.ui.main;
const { Keybindings } = Me.imports.keybindings;
const { ShellWindow } = Me.imports.window;
const { WindowSearch } = Me.imports.window_search;
const Tags = Me.imports.tags;
const { Tiler } = Me.imports.tiling;
const { ExtensionSettings, Settings } = Me.imports.settings;
const { Storage, World } = Me.imports.ecs;
const { Swapper } = Me.imports.swapper;

const WINDOW_CHANGED_POSITION = 0;
const WINDOW_CHANGED_SIZE = 1;

var Ext = class Ext extends World {
    constructor() {
        super();

        // Misc

        this.keybindings = new Keybindings(this);
        this.settings = new ExtensionSettings();

        this.overlay = new St.BoxLayout({
            style_class: "tile-preview"
        });

        // Storages

        this.icons = new Storage();
        this.ids = new Storage();
        this.names = new Storage();
        this.tilable = new Storage();
        this.windows = new Storage();

        // Dialogs

        this.window_search = new WindowSearch(this);

        // Systems

        this.focus_switcher = new Focus.FocusSwitcher(this);
        this.swapper = new Swapper(this);
        this.tiler = new Tiler(this);

        // Signals

        global.display.connect('window_created', (display, win) => this.on_window_create(display, win));
    }

    connect_window(win, actor) {
        win.meta.connect('position-changed', () => this.on_window_changed(win, WINDOW_CHANGED_POSITION));
        win.meta.connect('size-changed', () => this.on_window_changed(win, WINDOW_CHANGED_SIZE));
    }

    active_window_list() {
        let workspace = global.workspace_manager.get_active_workspace();
        return this.tab_list(Meta.TabList.NORMAL, workspace);
    }

    focus_window() {
        return this.get_window(global.display.get_focus_window());
    }

    /// Fetches the window component from the entity associated with the metacity window metadata.
    get_window(meta) {
        // TODO: Deprecate this
        return this.windows.get(this.window(meta));
    }

    /// Fetches the window entity which is associated with the metacity window metadata.
    window(meta) {
        if (!meta) return null;

        let id = meta.get_stable_sequence();

        // Locate the window entity with the matching ID
        let entity = this.ids.find(id)[0];

        // If not found, create a new entity with a ShellWindow component.
        if (!entity) {
            entity = this.create_entity();
            let win = new ShellWindow(entity, meta, this);
            this.windows.insert(entity, win);
            this.ids.insert(entity, id);
            log(`added window (${win.entity}): ${win.name()}`);
        }

        return entity;
    }

    load_settings() {
        this.tiler.set_gap(settings.gap());
    }

    tiled_windows() {
        return this.entities.filter((entity) => this.contains_tag(entity, Tags.Tiled));
    }

    on_window_changed(win, event) {
        if (!this.contains_tag(win.entity, Tags.Tiled)) {
            return;
        }

        log(`tiled window size changed: ${win.name()}`);
    }

    on_window_create(display, window, second_try) {
        let actor = window.get_compositor_private();
        if (!actor) {
            if (!second_try) {
                Mainloop.idle_add(bind(this, () => {
                    this.on_window_create(display, window, true);
                    return false;
                }));
            }
            return;
        }

        let win = this.get_window(window);
        if (win) {
            win.meta.get_compositor_private().connect('destroy', () => {
                log(`destroying window (${win.entity}): ${win.name()}`);
                this.delete_entity(win.entity);
            });

            if (win.is_tilable()) {
                this.connect_window(win, actor);
            }
        }
    }

    // Snaps all windows to the window grid
    snap_windows() {
        this.tiler.snap_windows(
            Meta.get_window_actors(global.display)
                .map((win) => this.get_window(win.get_meta_window()))
                .filter((win) => win.is_tilable())
        );
    }

    tab_list(tablist, workspace) {
        return global.display.get_tab_list(tablist, workspace).map((win) => this.get_window(win));
    }
}

var ext = new Ext();

function init() {
    log("init");
}

function enable() {
    log("enable");

    load_theme();

    uiGroup.add_actor(ext.overlay);

    ext.keybindings.enable(ext.keybindings.global)
        .enable(ext.keybindings.window_focus)
        .enable(ext.keybindings.window_swap);

    // Code to execute after the shell has finished initializing everything.
    global.run_at_leisure(() => {
        ext.snap_windows();
    });
}

function disable() {
    log("disable");

    uiGroup.remove_actor(ext.overlay);

    ext.tiler.exit();

    ext.keybindings.disable(ext.keybindings.global)
        .disable(ext.keybindings.window_focus)
        .disable(ext.keybindings.window_swap);
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
