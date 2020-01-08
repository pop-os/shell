const Me = imports.misc.extensionUtils.getCurrentExtension();

const Mainloop = imports.mainloop;
const Focus = Me.imports.focus;
const { Gio, Meta, Shell, St } = imports.gi;
const { log } = Me.imports.lib;
const { _defaultCssStylesheet, uiGroup, wm } = imports.ui.main;
const { ShellWindow } = Me.imports.window;
const { WindowSearch } = Me.imports.window_search;
const { Tiler } = Me.imports.tiling;
const { ExtensionSettings, Settings } = Me.imports.settings;

var Ext = class Ext {
    constructor() {
        this.settings = new ExtensionSettings();

        this.overlay = new St.BoxLayout({
            style_class: "tile-preview"
        });

        this.window_search = new WindowSearch();
        this.tiler = new Tiler(this);

        this.global_keybindings = {
            "focus-left": () => Focus.left(),
            "focus-down": () => Focus.down(),
            "focus-up": () => Focus.up(),
            "focus-right": () => Focus.right(),
            "focus-monitor-left": () => Focus.monitor_left(),
            "focus-monitor-right": () => Focus.monitor_right(),
            "search": () => this.window_search.open(),
            "swap-above": () => Focus.swap(Focus.window_up),
            "swap-below": () => Focus.swap(Focus.window_down),
            "swap-left": () => Focus.swap(Focus.window_left),
            "swap-right": () => Focus.swap(Focus.window_right),
            "tile-enter": () => this.tiler.enter(),
        };
    }

    keybindings_enable(keybindings) {
        for (var name in keybindings) {
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
        for (var name in keybindings) {
            wm.removeKeybinding(name);
        }
    }

    load_settings() {
        this.tiler.set_gap(settings.gap());
    }

    // Snaps all windows to the window grid
    snap_windows() {
        this.tiler.snap_windows(
            Meta.get_window_actors(global.display)
                .map((win) => new ShellWindow(win.get_meta_window()))
                .filter((win) => win.is_tilable())
        );
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
