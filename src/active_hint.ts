// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { ShellWindow } from "./window";

import * as Ecs from 'ecs';

const { GLib, St } = imports.gi;
const { main } = imports.ui;

interface WindowDetails {
    entity: Entity;
    meta: Meta.Window;
    parent: Clutter.Actor;
    source1: number;
    source2: number;
    source3: number;
}

export class ActiveHint {
    dpi: number;

    private border: [Clutter.Actor, Clutter.Actor, Clutter.Actor, Clutter.Actor] = [
        new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        }),
        new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        }),
        new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        }),
        new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        })
    ];

    private clones: [Clutter.Actor, Clutter.Actor, Clutter.Actor, Clutter.Actor] = [
        this.border[0].ref(),
        this.border[1].ref(),
        this.border[2].ref(),
        this.border[3].ref()
    ];

    private reparenting: number | null = null;
    private tracking: number | null = null;

    private window: WindowDetails | null = null;

    constructor(dpi: number) {
        this.dpi = dpi;

        for (const box of this.border) {
            main.layoutManager.trackChrome(box, { affectsInputRegion: false });
        }
    }

    reparent() {
        if (this.window) {
            const actor = this.window.meta.get_compositor_private();
            if (!actor) return;

            const parent = actor.get_parent();
            if (!parent) return;

            this.clones.forEach((box, id) => {
                this.border[id].hide();
                (this.window as WindowDetails).parent.remove_child(box);
                this.clones[id] = this.border[id].ref();
                parent.add_child(this.border[id]);
            });


            this.reparenting = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this.reparenting = null;

                this.border.forEach((box) => {
                    parent.set_child_below_sibling(box, actor);
                    (parent as any).set_child_above_sibling(actor, null);
                    box.show();
                });

                return false;
            });

            this.window.parent = parent;
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
                source1: window.meta.connect('size-changed', () => {
                    this.update_overlay();
                    return true;
                }),
                source2: window.meta.connect('position-changed', () => {
                    this.update_overlay();
                    return true;
                }),
                source3: actor.connect('parent-set', () => {
                    this.reparent();
                    return true;
                })
            };

            this.tracking = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this.tracking = null;
                this.update_overlay();

                this.border.forEach((box) => {
                    parent.add_child(box);
                    parent.set_child_below_sibling(box, actor);
                    (parent as any).set_child_above_sibling(actor, null);

                    box.show();
                    box.visible = true;
                });

                return false;
            });
        }
    }

    untrack() {
        this.disconnect_signals();

        this.border.forEach((box) => {
            box.hide();
            box.visible = false;
        });

        if (this.window) {
            const actor = this.window.meta.get_compositor_private();
            if (actor) {
                this.window.meta.disconnect(this.window.source1);
                this.window.meta.disconnect(this.window.source2);
                actor.disconnect(this.window.source3);
            }

            this.border.forEach((box) => {
                let clone = box;
                (this.window as WindowDetails).parent.remove_child(clone);
            });

            this.window = null;
        }
    }

    update_overlay() {
        if (this.window) {
            const rect = this.window.meta.get_frame_rect();

            const width = 4 * this.dpi;

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

        this.border.forEach((box) => {
            main.layoutManager.untrack(box);
        });
    }

    disconnect_signals() {
        if (this.reparenting) {
            GLib.source_remove(this.reparenting);
            this.reparenting = null;
        }

        if (this.tracking) {
            GLib.source_remove(this.tracking);
            this.tracking = null;
        }
    }
}
