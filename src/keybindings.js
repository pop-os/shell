const { wm } = imports.ui.main;
const { Meta, Shell } = imports.gi;

var Keybindings = class Keybindings {
    constructor(ext) {
        this.ext = ext;
        this.global = {
            "search": () => ext.window_search.open(),
            "tile-enter": () => ext.tiler.enter()
        };

        this.window_focus = {
            "focus-left": () => ext.focus_switcher.left(),
            "focus-down": () => ext.focus_switcher.down(ext.active_window_list()),
            "focus-up": () => ext.focus_switcher.up(ext.active_window_list()),
            "focus-right": () => ext.focus_switcher.right(ext.active_window_list()),
            "focus-monitor-left": () => ext.focus_switcher.monitor_left(ext.active_window_list()),
            "focus-monitor-right": () => ext.focus_switcher.monitor_right(ext.active_window_list())
        };
    }

    enable(keybindings) {
        for (const name in keybindings) {
            wm.addKeybinding(
                name,
                this.ext.settings.inner,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                keybindings[name]
            );
        }

        return this;
    }

    disable(keybindings) {
        for (const name in keybindings) {
            wm.removeKeybinding(name);
        }

        return this;
    }
};
