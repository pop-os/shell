const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';
import * as widgets from 'widgets';

const { Clutter, GObject, Pango, St } = imports.gi;
const { ModalDialog } = imports.ui.modalDialog;

export class Search {
    dialog: any;

    private active_id: number;
    private entry: any;
    private list: any;
    private text: any;
    private widgets: Array<any>;

    constructor(
        cancel: () => void,
        search: (pattern: string) => Array<[string, any, any]> | null,
        select: (id: number) => void,
        apply: (id: number | string) => void
    ) {
        this.dialog = new ModalDialog({
            styleClass: "pop-shell-search",
            destroyOnClose: false,
            shellReactive: true,
            shouldFadeIn: false,
            shouldFadeOut: false
        });

        this.active_id = 0;
        this.widgets = [];

        this.entry = new St.Entry({
            can_focus: true,
            x_expand: true
        });

        this.text = this.entry.clutter_text;
        this.dialog.setInitialKeyFocus(this.text);

        this.text.connect("activate", () => {
            const text: string = this.text.get_text();
            if (text.startsWith(':')) {
                apply(text.slice(1));
            } else if (this.active_id < this.widgets.length) {
                apply(this.active_id);
            }

            this.reset();
            this.dialog.popModal();
            this.dialog.close();
        });

        this.text.connect("text-changed", (entry: any) => {
            this.clear();

            const text = entry.get_text();
            if (text.startsWith(':')) return;

            const update = search(text.toLowerCase());
            if (update) {
                this.update_search_list(update);
            }
        });

        this.text.connect("key-press-event", (_: any, event: any) => {
            // Prevents key repeat events
            if (event.get_flags() != Clutter.EventFlags.NONE) {
                return;
            }

            let c = event.get_key_code();
            if (c == 9) {
                // Escape key was pressed
                this.reset();
                this.dialog.popModal();
                this.dialog.close();
                cancel();
                return;
            } else if (c == 111) {
                // Up arrow was pressed
                if (0 < this.active_id) {
                    this.unselect();
                    this.active_id -= 1;
                    this.select();
                }
            } else if (c == 116) {
                // Down arrow was pressed
                if (this.active_id + 1 < this.widgets.length) {
                    this.unselect();
                    this.active_id += 1;
                    this.select();
                }
            }

            select(this.active_id);
        });

        this.list = new St.BoxLayout({
            styleClass: "pop-shell-search-list",
            vertical: true,
            margin_top: 12
        });

        this.dialog.contentLayout.add(this.entry);
        this.dialog.contentLayout.add(this.list);

        // Ensure that the width is at least 480 pixels wide.
        this.dialog.contentLayout.width = Math.max(Lib.current_monitor().width / 4, 480);
    }

    clear() {
        Lib.recursive_remove_children(this.list);
        this.list.hide();
        this.widgets = [];
        this.active_id = 0;
    }

    reset() {
        this.clear();
        this.text.set_text(null);
    }

    show() {
        this.dialog.show_all();
        this.clear();
        this.entry.grab_key_focus();
    }

    select() {
        this.widgets[this.active_id].set_style_class_name(
            "pop-shell-search-element pop-shell-search-active"
        );
    }

    unselect() {
        this.widgets[this.active_id].set_style_class_name(
            "pop-shell-search-element"
        );
    }

    update_search_list(list: Array<any>) {
        Lib.join(
            list.values(),
            (element: [string, any, any]) => {
                const [title, cat_icon, icon] = element;

                let label = new St.Label({
                    text: title,
                    styleClass: "pop-shell-search-label"
                });

                label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

                let container = new widgets.Box({ styleClass: "pop-shell-search-element" })
                    .add(cat_icon, { y_fill: false, y_align: St.Align.MIDDLE })
                    .add(icon, { y_fill: false, y_align: St.Align.MIDDLE })
                    .add(label, { y_fill: false, y_align: St.Align.MIDDLE })
                    .container;

                this.widgets.push(container);
                this.list.add(container);
            },
            () => this.list.add(Lib.separator())
        );

        this.list.show();
        if (this.widgets.length != 0) {
            this.select();
        }
    }
}
