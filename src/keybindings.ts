import type { Ext } from "./extension";

const { wm } = imports.ui.main;
const { Meta, Shell } = imports.gi;

export class Keybindings {
    global: Record<string, () => void>;
    window_focus: Object;

    private ext: Ext

    constructor(ext: Ext) {
        this.ext = ext;
        this.global = {
            "tile-enter": () => ext.tiler.enter(ext)
        };

        if (ext.settings.use_launcher()) {
            this.global["search"] = () => {
                ext.tiler.exit(ext);
                ext.window_search.load_desktop_files();
                ext.window_search.open(ext);
            }
        }

        this.window_focus = {
            "focus-left": () => ext.activate_window(ext.focus_selector.left(ext, null)),
            "focus-down": () => ext.activate_window(ext.focus_selector.down(ext, null)),
            "focus-up": () => ext.activate_window(ext.focus_selector.up(ext, null)),
            "focus-right": () => ext.activate_window(ext.focus_selector.right(ext, null)),
            "focus-monitor-left": () => ext.activate_window(ext.focus_selector.monitor_left(ext, null)),
            "focus-monitor-right": () => ext.activate_window(ext.focus_selector.monitor_right(ext, null)),
            "tile-orientation": () => ext.auto_tiler?.toggle_orientation(ext),
            "toggle-floating": () => ext.auto_tiler?.toggle_floating(ext)
        };
    }

    enable(keybindings: any) {
        for (const name in keybindings) {
            wm.addKeybinding(
                name,
                this.ext.settings.ext,
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
