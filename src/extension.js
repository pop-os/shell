const Me = imports.misc.extensionUtils.getCurrentExtension();

const ExtensionUtils = imports.misc.extensionUtils;
const Focus = Me.imports.focus;
const { Gio, Meta, St } = imports.gi;
const { log, Keybindings } = Me.imports.lib;
const { _defaultCssStylesheet, uiGroup } = imports.ui.main;
const { WindowSearch } = Me.imports.window_search;
const { Tiler } = Me.imports.tiling;

var window_search = new WindowSearch();
var tiler = new Tiler();

let global_keybindings = {
    "focus-left": () => Focus.left(),
    "focus-down": () => Focus.down(),
    "focus-up": () => Focus.up(),
    "focus-right": () => Focus.right(),
    "focus-monitor-left": () => Focus.monitor_left(),
    "focus-monitor-right": () => Focus.monitor_right(),
    "search": () => window_search.open(),
    "swap-above": () => Focus.swap(Focus.window_up),
    "swap-below": () => Focus.swap(Focus.window_down),
    "swap-left": () => Focus.swap(Focus.window_left),
    "swap-right": () => Focus.swap(Focus.window_right),
    "tile-enter": () => tiler.enter(),
};

function init() {
    log("init");
}

function enable() {
    log("enable");
    
    load_theme();

    uiGroup.add_actor(tiler.overlay);

    Keybindings.enable(global_keybindings);

    // Code to execute after the shell has finished initializing everything.
    global.run_at_leisure(() => {
        snap_windows();
    });
}

function disable() {
    log("disable");

    uiGroup.remove_actor(tiler.overlay);

    tiler.exit();

    Keybindings.disable(global_keybindings);
}

// Snaps all windows to the window grid
function snap_windows() {
    tiler.snap_windows(
        Meta.get_window_actors(global.display)
            .map((win) => win.get_meta_window())
            .filter((win) => !win.is_override_redirect())
    );
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
