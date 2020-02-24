import { Ext } from "./extension";

const { wm } = imports.ui.main;
const { Meta, Shell } = imports.gi;

export class Keybindings {
    ext: Ext
    global: Object;
    window_focus: Object;

    constructor(ext: Ext) {
        this.ext = ext;
        this.global = {
            "search": () => ext.window_search.open(),
            "tile-enter": () => ext.tiler.enter()
        };

        this.window_focus = {
            "focus-left": () => ext.activate_window(ext.focus_selector.left(null)),
            "focus-down": () => ext.activate_window(ext.focus_selector.down(null)),
            "focus-up": () => ext.activate_window(ext.focus_selector.up(null)),
            "focus-right": () => ext.activate_window(ext.focus_selector.right(null)),
            "focus-monitor-left": () => ext.activate_window(ext.focus_selector.monitor_left(null)),
            "focus-monitor-right": () => ext.activate_window(ext.focus_selector.monitor_right(null)),
            "tile-orientation": () => ext.toggle_orientation()
        };
    }

    enable(keybindings: any) {
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

    disable(keybindings: Object) {
        for (const name in keybindings) {
            wm.removeKeybinding(name);
        }

        return this;
    }
};
