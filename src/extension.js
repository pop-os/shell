const Me = imports.misc.extensionUtils.getCurrentExtension();

const Mainloop = imports.mainloop;
const Focus = Me.imports.focus;
const { Gio, Meta, Shell, St } = imports.gi;
const { bind } = imports.lang;
const { log } = Me.imports.lib;
const { _defaultCssStylesheet, uiGroup, wm } = imports.ui.main;
const { ShellWindow } = Me.imports.window;
const { WindowSearch } = Me.imports.window_search;
const { Tiler } = Me.imports.tiling;
const { ExtensionSettings, Settings } = Me.imports.settings;
const { Storage, World } = Me.imports.ecs;

var Ext = class Ext {
    constructor() {
        this.settings = new ExtensionSettings();

        this.overlay = new St.BoxLayout({
            style_class: "tile-preview"
        });

        this.window_search = new WindowSearch(this);
        this.tiler = new Tiler(this);

        this.world = new World();
        this.world.ids = new Storage();
        this.world.windows = new Storage();

        this.global_keybindings = {
            "focus-left": () => this.focus_shift_left(),
            "focus-down": () => this.focus_shift_down(),
            "focus-up": () => this.focus_shift_up(),
            "focus-right": () => this.focus_shift_right(),
            "focus-monitor-left": () => this.focus_shift_monitor_left(),
            "focus-monitor-right": () => this.focus_shift_monitor_right(),
            "search": () => this.window_search.open(),
            "swap-above": () => this.window_swap_above(),
            "swap-below": () => this.window_swap_below(),
            "swap-left": () => this.window_swap_left(),
            "swap-right": () => this.window_swap_right(),
            "tile-enter": () => this.tiler.enter(),
        };

        global.display.connect('window_created', this.on_window_create);
    }

    connect_window(win) {

    }

    keybindings_enable(keybindings) {
        for (let name in keybindings) {
            wm.addKeybinding(
                name,
                this.settings.inner,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                keybindings[name]
            );
        }
    }

    keybindings_disable(keybindings) {
        for (let name in keybindings) {
            wm.removeKeybinding(name);
        }
    }

    focus_shift(direction) {
        let workspace = global.workspace_manager.get_active_workspace();
        let window_list = this.tab_list(Meta.TabList.NORMAL, workspace);
        Focus.focus(direction, (win) => win.activate(), this.focus_window(), window_list);
    }

    focus_shift_down() {
        this.focus_shift(Focus.window_down);
    }

    focus_shift_left() {
        this.focus_shift(Focus.window_left);
    }

    focus_shift_right() {
        this.focus_shift(Focus.window_right);
    }

    focus_shift_up() {
        this.focus_shift(Focus.window_up);
    }

    focus_shift_monitor_left() {
        this.focus_shift(Focus.window_monitor_left);
    }

    focus_shift_monitor_right() {
        this.focus_shift(Focus.window_monitor_right);
    }

    focus_window() {
        return this.get_window(global.display.get_focus_window());
    }

    /// Fetches the window component from the entity associated with the metacity window metadata.
    get_window(meta) {
        // TODO: Deprecate this
        return this.world.windows.get(this.window(meta));
    }

    /// Fetches the window entity which is associated with the metacity window metadata.
    window(meta) {
        if (!meta) return null;

        let id = meta.get_stable_sequence();

        // Locate the window entity with the matching ID
        let entity = this.world.ids.find(id)[0];

        // If not found, create a new entity with a ShellWindow component.
        if (!entity) {
            entity = this.world.create_entity();
            let win = new ShellWindow(entity, meta);
            this.world.windows.insert(entity, win);
            this.world.ids.insert(entity, id);
        }

        return entity;
    }

    load_settings() {
        this.tiler.set_gap(settings.gap());
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
        if (win && win.can_be_tiled()) {
            this.connect_window(win, actor);
        }
    }

    // Snaps all windows to the window grid
    snap_windows() {
        this.tiler.snap_windows(
            Meta.get_window_actors(global.display)
                .map((win) => new ShellWindow(win.get_meta_window()))
                .filter((win) => win.is_tilable())
        );
    }

    tab_list(tablist, workspace) {
        return global.display.get_tab_list(tablist, workspace).map((win) => this.get_window(win));
    }

    window_swap(direction) {
        let workspace = global.workspace_manager.get_active_workspace();
        let window_list = this.tab_list(Meta.TabList.NORMAL, workspace);
        let focused = this.focus_window();
        Focus.focus(direction, (win) => focused.swap(win), focused, window_list);
    }

    window_swap_above() {
        this.window_swap(Focus.window_up);
    }

    window_swap_below() {
        this.window_swap(Focus.window_down);
    }

    window_swap_left() {
        this.window_swap(Focus.window_left);
    }

    window_swap_right() {
        this.window_swap(Focus.window_right);
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

    ext.keybindings_enable(ext.global_keybindings);

    // Code to execute after the shell has finished initializing everything.
    global.run_at_leisure(() => {
        ext.snap_windows();
    });
}

function disable() {
    log("disable");

    uiGroup.remove_actor(ext.overlay);

    ext.tiler.exit();

    ext.keybindings_disable(ext.global_keybindings);
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
