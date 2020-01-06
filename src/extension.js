const Me = imports.misc.extensionUtils.getCurrentExtension();

const ExtensionUtils = imports.misc.extensionUtils;
const Focus = Me.imports.focus;
const Gio = imports.gi.Gio;
const { log, Keybindings } = Me.imports.lib;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Tiling = Me.imports.tiling;

function window_app_name(win) {
    let app = Shell.WindowTracker.get_default().get_window_app(win);
    let name = null;
    try {
      name = app.get_name().replace(/&/g, "&amp;");
    } catch (e) {
      log("window_app_name: " + e);
    }
    return name;
}

function search() {
    log("search");

    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, null);
    windows.forEach(function (win) {
        let name = window_app_name(win);
        let title = "";
        if (name) {
            title += name + ": ";
        }
        title += win.get_title();
        log("  " + title);
    });
}

var tiler = new Tiling.Tiler();

let global_keybindings = {
    "focus-left": () => Focus.left(),
    "focus-down": () => Focus.down(),
    "focus-up": () => Focus.up(),
    "focus-right": () => Focus.right(),
    "focus-monitor-left": () => Focus.monitor_left(),
    "focus-monitor-right": () => Focus.monitor_right(),
    //"search": () => search(),
    "tile-enter": () => tiler.enter(),
};

function init() {
    log("init");
}

function enable() {
    log("enable");
    // Add tiling overlay
    Main.uiGroup.add_actor(tiler.overlay);
    // Enable global keybindings
    Keybindings.enable(global_keybindings);
}

function disable() {
    log("disable");
    // Remove tiling overlay
    Main.uiGroup.remove_actor(tiler.overlay);
    // Exit tiling mode if necessary
    tiler.exit();
    // Disable global keybindings
    Keybindings.disable(global_keybindings);
}
