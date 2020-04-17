// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { ShellWindow } from "./window";

import * as Ecs from 'ecs';

const { GLib, St } = imports.gi;

interface WindowDetails {
    entity: Entity;
    meta: Meta.Window;
    parent: Clutter.Actor;
    source1: number;
    source2: number;
}

export class ActiveHint {
    dpi: number;

    private border: [Clutter.Actor, Clutter.Actor, Clutter.Actor, Clutter.Actor] = [
        new St.BoxLayout({
            reactive: false,
            style_class: 'pop-shell-active-hint',
            visible: false
        }),
        new St.BoxLayout({
            reactive: false,
            style_class: 'pop-shell-active-hint',
            visible: false
        }),
        new St.BoxLayout({
            reactive: false,
            style_class: 'pop-shell-active-hint',
            visible: false
        }),
        new St.BoxLayout({
            reactive: false,
            style_class: 'pop-shell-active-hint',
            visible: false
        })
    ];

    private tracking: number | null = null;

    window: WindowDetails | null = null;

    constructor(dpi: number) {
        this.dpi = dpi;

        for (const box of this.border) {
            global.window_group.add_child(box);
            global.window_group.set_child_above_sibling(box, null);
        }
    }

    hide() {
        global.log(`hiding active hint`);
        for (const box of this.border) {
            box.hide();
            box.visible = false;
        }
    }

    is_tracking(entity: Entity): boolean {
        return this.window ? Ecs.entity_eq(entity, this.window.entity) : false;
    }

    position_changed(window: ShellWindow): void {
        if (window.is_maximized()) {
            this.hide();
        } else {
            this.show();
            this.update_overlay();
        }
    }

    show() {
        for (const box of this.border) {
            box.visible = true;
            box.show();
        }
    }

    track(window: ShellWindow) {
        this.disconnect_signals();

        if (this.window) {
            if (Ecs.entity_eq(this.window.entity, window.entity)) {
                return;
            }

            this.untrack();
        }

        const actor = window.meta.get_compositor_private();
        if (!actor) return;

        const parent = actor.get_parent();

        if (parent) {
            this.window = {
                entity: window.entity,
                meta: window.meta,
                parent: parent,
                source1: window.meta.connect('size-changed', () => this.position_changed(window)),
                source2: window.meta.connect('position-changed', () => this.position_changed(window)),
            };

            this.tracking = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this.tracking = null;
                this.update_overlay();

                this.show();

                return false;
            });
        }
    }

    untrack() {
        this.disconnect_signals();

        this.hide();

        if (this.window) {
            const actor = this.window.meta.get_compositor_private();
            if (actor) {
                this.window.meta.disconnect(this.window.source1);
                this.window.meta.disconnect(this.window.source2);
            }

            this.window = null;
        }
    }

    update_overlay() {
        if (this.window) {
            const rect = this.window.meta.get_frame_rect();

            const width = 3 * this.dpi;

            const [left, top, right, bottom] = this.border;

            left.x = rect.x - width;
            left.y = rect.y;
            left.width = width;
            left.height = rect.height;

            right.x = rect.x + rect.width;
            right.y = rect.y;
            right.width = width;
            right.height = rect.height;

            top.x = rect.x - width;
            top.y = rect.y - width;
            top.width = (2 * width) + rect.width;
            top.height = width;

            bottom.x = rect.x - width;
            bottom.y = rect.y + rect.height;
            bottom.width = (2 * width) + rect.width;
            bottom.height = width;
        }
    }

    destroy() {
        this.untrack();

        for (const box of this.border) {
            global.window_group.remove_child(box);
        }
    }

    disconnect_signals() {
        if (this.tracking) {
            GLib.source_remove(this.tracking);
            this.tracking = null;
        }
    }
}
