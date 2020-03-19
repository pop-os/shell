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

    private overlay: Clutter.Actor;
    private clone: Clutter.Actor;
    private window: WindowDetails | null = null;

    constructor(dpi: number) {
        this.dpi = dpi;

        this.overlay = new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        });

        this.clone = this.overlay.ref();

        main.layoutManager.trackChrome(this.overlay, { affectsInputRegion: false });
    }

    reparent() {
        if (this.window) {
            const actor = this.window.meta.get_compositor_private();
            if (!actor) return;

            const parent = actor.get_parent();
            if (!parent) return;

            this.overlay.hide();

            this.window.parent.remove_child(this.clone);
            this.clone = this.overlay.ref();

            parent.add_child(this.overlay);
            parent.set_child_below_sibling(this.overlay, actor);
            (parent as any).set_child_above_sibling(actor, null);

            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                parent.add_child(this.overlay);
                parent.set_child_below_sibling(this.overlay, actor);
                (parent as any).set_child_above_sibling(actor, null);
                this.overlay.show();
            });

            this.window.parent = parent;
        }
    }

    track(window: ShellWindow) {
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

            this.update_overlay();

            parent.add_child(this.overlay);
            parent.set_child_below_sibling(this.overlay, actor);
            (parent as any).set_child_above_sibling(actor, null);

            this.overlay.show();
            this.overlay.visible = true;
        }
    }

    untrack() {
        this.overlay.hide();
        this.overlay.visible = false;
        if (this.window) {
            const actor = this.window.meta.get_compositor_private();
            if (actor) {
                this.window.meta.disconnect(this.window.source1);
                this.window.meta.disconnect(this.window.source2);
                actor.disconnect(this.window.source3);
            }

            let clone = this.overlay;
            this.window.parent.remove_child(clone);
            this.window = null;
        }
    }

    update_overlay() {
        if (this.window) {
            const rect = this.window.meta.get_frame_rect();

            this.overlay.x = rect.x - (4 * this.dpi);
            this.overlay.y = rect.y - (4 * this.dpi);
            this.overlay.width = rect.width + (8 * this.dpi);
            this.overlay.height = rect.height + (8 * this.dpi);
        }
    }

    destroy() {
        this.untrack();
        main.layoutManager.untrackChrome(this.overlay);
    }
}
