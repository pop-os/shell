// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { Ext } from "./extension";

const { wm } = imports.ui.main;
const { Meta, Shell } = imports.gi;

import * as Node from 'node';
import { Stack } from "./stack";

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
            "tile-enter": () => ext.tiler.enter(ext)
        };

        this.window_focus = {
            "focus-left": () => {
                this.stack_select(
                    ext,
                    (id, stack) => id === 0 ? null : stack.components[id - 1].entity,
                    () => ext.activate_window(ext.focus_selector.left(ext, null))
                );
            },

            "focus-down": () => ext.activate_window(ext.focus_selector.down(ext, null)),
            "focus-up": () => ext.activate_window(ext.focus_selector.up(ext, null)),

            "focus-right": () => {
                this.stack_select(
                    ext,
                    (id, stack) => stack.components.length > id + 1 ? stack.components[id + 1].entity : null,
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
        };
    }

    stack_select(
        ext: Ext,
        select: (id: number, stack: Stack) => Entity | null,
        focus_shift: () => void,
    ) {
        const switched = this.stack_switch(ext, (stack) => {
            if (!stack) return false;

            const container = ext.auto_tiler?.forest.stacks.get(stack.idx);
            if (container) {
                const id = container.active_id;
                if (id !== -1) {
                    const next = select(id, container);
                    if (next) {
                        container.activate(next);
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
