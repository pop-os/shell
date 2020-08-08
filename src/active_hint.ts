// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { ShellWindow } from "./window";

import * as Ecs from 'ecs';

const { GLib, St } = imports.gi;

interface Details {
    sources: Array<number>;
    workspace: number;
}

interface WindowDetails extends Details {
    kind: 1;
    entity: Entity;
    meta: Meta.Window;
    parent: Clutter.Actor;
}

export class ActiveHint {
    dpi: number;

    private border: [Clutter.Actor, Clutter.Actor, Clutter.Actor, Clutter.Actor] = [
        new St.BoxLayout({ style_class: 'pop-shell-active-hint' }),
        new St.BoxLayout({ style_class: 'pop-shell-active-hint' }),
        new St.BoxLayout({ style_class: 'pop-shell-active-hint' }),
        new St.BoxLayout({ style_class: 'pop-shell-active-hint' })
    ];

    private tracking: number | null = null;

    tracked: WindowDetails | null = null;

    restacker: SignalID = (global.display as GObject.Object).connect('restacked', () => this.restack_auto());

    constructor(dpi: number) {
        this.dpi = dpi;

        for (const box of this.border) {
            global.window_group.add_child(box);
            global.window_group.set_child_above_sibling(box, null);
        }
    }

    hide() {
        for (const box of this.border) {
            box.hide();
            box.visible = false;
        }
    }

    is_tracking(entity: Entity): boolean {
        return this.tracked ? Ecs.entity_eq(entity, this.tracked.entity) : false;
    }

    position_changed(window: ShellWindow): void {
        if (window.is_maximized() || window.meta.minimized) {
            this.hide();
        } else {
            this.show();
            this.update_overlay(window.rect());
        }
    }

    restack(actor: Clutter.Actor) {
        if (this.tracked) {
            if (this.tracked.workspace === global.workspace_manager.get_active_workspace_index()) {
                // Avoid restacking if the window is maximized / fullscreen
                if (this.tracked.kind === 1) {
                    if (this.tracked.meta.get_maximized() !== 0 || this.tracked.meta.is_fullscreen()) return;
                }

                // Do not show the boxes when the window being tracked is minimized
                if (!this.tracked.meta.minimized) {
                    this.show();
                } else {
                    this.hide();
                }

                for (const box of this.border) {
                    global.window_group.set_child_above_sibling(box, actor);
                }
            } else {
                this.hide();
            }
        }
    }

    restack_auto() {
        if (!this.tracked) return;
        let actor: null | Clutter.Actor = null;

        if (this.tracked.kind === 1) {
            actor = this.tracked.meta.get_compositor_private();
        }

        if (actor) this.restack(actor);
    }

    show() {
        for (const box of this.border) {
            box.visible = true;
            box.show();
        }
    }

    track(window: ShellWindow) {
        this.disconnect_signals();

        if (window.meta.is_skip_taskbar()) return

        const actor = window.meta.get_compositor_private();
        if (!actor) return;

        const parent = actor.get_parent();

        if (parent) {
            this.tracked = {
                kind: 1,
                entity: window.entity,
                meta: window.meta,
                parent: parent,
                workspace: window.workspace_id(),
                sources: [
                    window.meta.connect('size-changed', () => this.position_changed(window)),
                    window.meta.connect('position-changed', () => this.position_changed(window))
                ],
            };

            this.tracking = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this.tracking = null;
                // do not show here, restack below will figure it out.
                this.update_overlay(window.rect());
                return false;
            });
        }

        this.restack(actor);
    }

    untrack() {
        this.disconnect_signals();

        this.hide();

        if (this.tracked) {
            const actor = this.tracked.meta.get_compositor_private();
            if (actor) {
                for (const s of this.tracked.sources.splice(0)) this.tracked.meta.disconnect(s);
            }

            this.tracked = null;
        }
    }

    update_overlay(rect: Rectangular) {
        const width = 3 * this.dpi;

        const [w, n, e, s] = this.border;

        w.x = rect.x - width;
        w.y = rect.y;
        w.width = width;
        w.height = rect.height;

        e.x = rect.x + rect.width;
        e.y = rect.y;
        e.width = width;
        e.height = rect.height;

        n.x = rect.x - width;
        n.y = rect.y - width;
        n.width = (2 * width) + rect.width;
        n.height = width;

        s.x = rect.x - width;
        s.y = rect.y + rect.height;
        s.width = (2 * width) + rect.width;
        s.height = width;
    }

    destroy() {
        global.display.disconnect(this.restacker);

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
