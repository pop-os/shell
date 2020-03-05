import type { Entity } from './ecs';
import type { ShellWindow } from "./window";

const { St } = imports.gi;
const { main } = imports.ui;

interface WindowDetails {
    entity: Entity;
    meta: Meta.Window;
    parent: Clutter.Actor;
}

export class ActiveHint {
    private overlay: Clutter.Actor;
    private source1: number = 0;
    private source2: number = 0;
    private window: WindowDetails | null = null;

    constructor() {
        this.overlay = new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        });
    }

    track_window(window: ShellWindow) {
        this.untrack(false);

        const actor = window.meta.get_compositor_private();
        const parent = actor.get_parent();

        if (parent) {
            this.window = {
                entity: window.entity,
                meta: window.meta,
                parent: parent,
            }
            this.update_overlay();

            parent.add_child(this.overlay);
            parent.set_child_below_sibling(this.overlay, actor);

            main.layoutManager.trackChrome(this.overlay, { affectsInputRegion: false });

            this.source1 = window.meta.connect('size-changed', () => {
                this.update_overlay();
                return true;
            });

            this.source2 = window.meta.connect('position-changed', () => {
                this.update_overlay();
                return true;
            });
        }
    }

    untrack(destroyed: boolean) {
        if (this.window) {
            if (!destroyed) {
                this.window.meta.disconnect(this.source1);
                this.window.meta.disconnect(this.source2);
            }

            this.window.parent.remove_child(this.overlay);
            main.layoutManager.untrackChrome(this.overlay);
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

            this.overlay.visible = true;
        }
    }

    destroy() {
        this.untrack(false);
        this.overlay.destroy();
    }
}
