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
            "focus-left": () => ext.activate_window(ext.focus_selector.left()),
            "focus-down": () => ext.activate_window(ext.focus_selector.down()),
            "focus-up": () => ext.activate_window(ext.focus_selector.up()),
            "focus-right": () => ext.activate_window(ext.focus_selector.right()),
            "focus-monitor-left": () => ext.activate_window(ext.focus_selector.monitor_left()),
            "focus-monitor-right": () => ext.activate_window(ext.focus_selector.monitor_right())
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
