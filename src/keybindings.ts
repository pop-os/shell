// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { Ext } from "./extension";

const { wm } = imports.ui.main;
const { Meta, Shell } = imports.gi;

import * as Node from 'node';
import { Stack } from "./stack";
import * as utils from 'utils';

export class Keybindings {
    global: Object;
    window_focus: Object;

    private ext: Ext

    constructor(ext: Ext) {
        this.ext = ext;
        this.global = {
            "activate-launcher": () => {
                ext.tiler.exit(ext);
                ext.window_search.load_desktop_files();
                ext.window_search.open(ext);
            },
            "tile-enter": () => ext.tiler.enter(ext),
            "pop-display-settings": () => utils.open_prefs(),
            "kbd-hint-size-decrease": () => this.hint_decrease(),
            "kbd-hint-size-increase": () => this.hint_increase(),
            "kbd-show-active-hint": () => this.toggle_hint(),
            "kbd-show-hint-color-dialog": () => utils.open_color_dialog()
        };

        this.window_focus = {
            "focus-left": () => {
                this.stack_select(
                    ext,
                    (id, stack) => id === 0 ? null : stack.tabs[id - 1].entity,
                    () => ext.activate_window(ext.focus_selector.left(ext, null))
                );
            },

            "focus-down": () => ext.activate_window(ext.focus_selector.down(ext, null)),

            "focus-up": () => ext.activate_window(ext.focus_selector.up(ext, null)),

            "focus-right": () => {
                this.stack_select(
                    ext,
                    (id, stack) => stack.tabs.length > id + 1 ? stack.tabs[id + 1].entity : null,
                    () => ext.activate_window(ext.focus_selector.right(ext, null))
                );
            },

            "tile-orientation": () => {
                const win = ext.focus_window();
                if (win) ext.auto_tiler?.toggle_orientation(ext, win);
            },

            "toggle-floating": () => ext.auto_tiler?.toggle_floating(ext),

            "toggle-tiling": () => ext.toggle_tiling(),

            "toggle-stacking-global": () => ext.auto_tiler?.toggle_stacking(ext),

            "pop-monitor-left": () => ext.move_monitor(Meta.DisplayDirection.LEFT),

            "pop-monitor-right": () => ext.move_monitor(Meta.DisplayDirection.RIGHT),

            "pop-monitor-up": () => ext.move_monitor(Meta.DisplayDirection.UP),

            "pop-monitor-down": () => ext.move_monitor(Meta.DisplayDirection.DOWN),

            "pop-workspace-up": () => ext.move_workspace(Meta.DisplayDirection.UP),

            "pop-workspace-down": () => ext.move_workspace(Meta.DisplayDirection.DOWN)
        };
    }

    toggle_hint() {
        this.ext.settings.set_active_hint(!this.ext.settings.active_hint());
    }

    hint_decrease() {
        const min = 3;
        let size_change = this.ext.settings.hint_size() - 1;

        if (size_change < min) {
            size_change = min;
        }
        this.ext.settings.set_hint_size(size_change);
    }

    hint_increase() {
        const max = 8;
        let size_change = this.ext.settings.hint_size() + 1;

        if (size_change > max) {
            size_change = max;
        }
        this.ext.settings.set_hint_size(size_change);
    }

    stack_select(
        ext: Ext,
        select: (id: number, stack: Stack) => Entity | null,
        focus_shift: () => void,
    ) {
        const switched = this.stack_switch(ext, (stack) => {
            if (!stack) return false;

            const stack_con = ext.auto_tiler?.forest.stacks.get(stack.idx);
            if (stack_con) {
                const id = stack_con.active_id;
                if (id !== -1) {
                    const next = select(id, stack_con);
                    if (next) {
                        stack_con.activate(next);
                        const window = ext.windows.get(next)
                        if (window) {
                            window.activate();
                            return true;
                        }
                    }
                }
            }

            return false;
        });

        if (!switched) {
            focus_shift();
        }
    }

    stack_switch(ext: Ext, apply: (stack: Node.NodeStack) => boolean) {
        const window = ext.focus_window();
        if (window) {
            if (ext.auto_tiler) {
                const node = ext.auto_tiler.find_stack(window.entity);
                return node ? apply(node[1].inner as Node.NodeStack) : false;
            }
        }
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
}
