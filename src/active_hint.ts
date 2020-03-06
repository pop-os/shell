const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { ShellWindow } from "./window";

import * as Ecs from 'ecs';

const { St } = imports.gi;
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
    private overlay: Clutter.Actor;

    private window: WindowDetails | null = null;

    constructor() {
        this.overlay = new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        });

        main.layoutManager.trackChrome(this.overlay, { affectsInputRegion: false });
    }

    reparent() {
        if (this.window) {
            const actor = this.window.meta.get_compositor_private();
            const parent = actor.get_parent();

            if (parent) {
                let clone = this.overlay;
                this.window.parent.remove_child(clone);

                parent.add_child(this.overlay);
                parent.set_child_below_sibling(this.overlay, actor);
                this.window.parent = parent;
            }
        }
    }

    track(window: ShellWindow) {
        if (this.window) {
            if (Ecs.entity_eq(this.window.entity, window.entity)) {
                return;
            }

            this.untrack(false);
        }

        const actor = window.meta.get_compositor_private();
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

            this.overlay.visible = true;
        }
    }

    untrack(destroyed: boolean) {
        this.overlay.visible = false;
        if (this.window) {
            if (!destroyed) {
                if (this.window.source1 && this.window.source2) {
                    this.window.meta.disconnect(this.window.source1);
                    this.window.meta.disconnect(this.window.source2);
                    this.window.meta.get_compositor_private().disconnect(this.window.source3);
                }
            }

            let clone = this.overlay;
            this.window.parent.remove_child(clone);
            this.window = null;
        }
    }

    update_overlay() {
        if (this.window) {
            const rect = this.window.meta.get_frame_rect();

            this.overlay.x = rect.x - 4;
            this.overlay.y = rect.y - 4;
            this.overlay.width = rect.width + 8;
            this.overlay.height = rect.height + 8;
        }
    }

    destroy() {
        this.untrack(false);
        main.layoutManager.untrackChrome(this.overlay);
    }
}
