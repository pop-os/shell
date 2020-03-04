import { ShellWindow } from "./window";

const { St } = imports.gi;
const { main } = imports.ui;

export class ActiveHint {
    overlay: any;
    source1: any;
    source2: any;
    meta: any | null;

    constructor() {
        this.overlay = new St.BoxLayout({
            reactive: true,
            style_class: 'pop-shell-active-hint',
            visible: false
        });
    }

    track_window(window: ShellWindow) {
        this.untrack();

        this.meta = window.meta;
        this.update_overlay();

        const actor = this.meta.get_compositor_private();

        const parent = actor.get_parent();
        parent.add_child(this.overlay);
        parent.set_child_above_sibling(actor, this.overlay);

        main.layoutManager.trackChrome(this.overlay, { affectsInputRegion: false });

        this.source1 = this.meta.connect('size-changed', () => this.update_overlay());
        this.source2 = this.meta.connect('position-changed', () => this.update_overlay());
    }

    untrack() {
        if (this.meta) {
            this.meta.disconnect(this.source1);
            this.meta.disconnect(this.source2);
            this.meta.get_compositor_private().get_parent().remove_child(this.overlay);
            main.layoutManager.untrackChrome(this.overlay);
        }
    }

    update_overlay() {
        const rect = this.meta.get_frame_rect();

        this.overlay.x = rect.x - 4;
        this.overlay.y = rect.y - 4;
        this.overlay.width = rect.width + 8;
        this.overlay.height = rect.height + 8;

        this.overlay.visible = true;
    }
}
