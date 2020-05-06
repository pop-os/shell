// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';
import * as widgets from 'widgets';

const { Clutter, Pango, St } = imports.gi;
const { ModalDialog } = imports.ui.modalDialog;

export class Search {
    dialog: Shell.ModalDialog;

    private active_id: number;
    private ignore_prefixes: Array<string>;
    private entry: St.Entry;
    private list: St.Widget;
    private text: Clutter.Text;
    private widgets: Array<St.Widget>;

    private select_cb: (id: number) => void;

    constructor(
        ignore_prefixes: Array<string>,
        cancel: () => void,
        search: (pattern: string) => Array<[string, St.Widget, St.Widget]> | null,
        select: (id: number) => void,
        apply: (text: string, index: number) => boolean,
        mode: (id: number) => void,
    ) {
        this.select_cb = select;
        this.dialog = new ModalDialog({
            styleClass: "pop-shell-search modal-dialog",
            destroyOnClose: false,
            shellReactive: true,
            shouldFadeIn: false,
            shouldFadeOut: false
        });

        this.active_id = 0;
        this.ignore_prefixes = ignore_prefixes;
        this.widgets = [];

        this.entry = new St.Entry({
            can_focus: true,
            x_expand: true
        });

        this.text = this.entry.get_clutter_text();
        this.dialog.setInitialKeyFocus(this.text);

        this.text.connect("activate", () => {
            const text: string = this.text.get_text();
            const cont = apply(text, this.active_id);

            if (!cont) {
                this.reset();
                this.close();
                cancel();
            }
        });

        this.text.connect("text-changed", (entry: any) => {
            this.clear();

            const text = (entry as Clutter.Text).get_text();

            let prefix = this.has_prefix(text);
            mode(prefix);

            if (prefix !== -1) return;

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

            let c = event.get_key_symbol();
            if (c == 65307) {
                // Escape key was pressed
                this.reset();
                this.close();
                cancel();
                return;
            }

            let s = event.get_state();
            if (c == 65362 || (s == Clutter.ModifierType.CONTROL_MASK && c == 107)) {
                // Up arrow was pressed
                if (0 < this.active_id) {
                    this.unselect();
                    this.active_id -= 1;
                    this.select();
                }
            } else if (c == 65364 || (s == Clutter.ModifierType.CONTROL_MASK && c == 106)) {
                // Down arrow was pressed
                if (this.active_id + 1 < this.widgets.length) {
                    this.unselect();
                    this.active_id += 1;
                    this.select();
                }
            }

            this.select_cb(this.active_id);
        });

        this.list = new St.BoxLayout({
            styleClass: "pop-shell-search-list",
            vertical: true,
        });

        this.dialog.contentLayout.add(this.entry);
        this.dialog.contentLayout.add(this.list);

        // Ensure that the width is at least 640 pixels wide.
        this.dialog.contentLayout.width = Math.max(Lib.current_monitor().width / 4, 640);
    }

    clear() {
        this.list.remove_all_children();
        this.list.hide();
        this.widgets = [];
        this.active_id = 0;
    }

    close() {
        this.dialog.close(global.get_current_time());
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
        this.widgets[this.active_id].add_style_pseudo_class(
            "select"
        );
    }

    unselect() {
        this.widgets[this.active_id].remove_style_pseudo_class(
            "select"
        );
    }

    update_search_list(list: Array<[string, St.Widget, St.Widget]>) {
        Lib.join(
            list.values(),
            (element: [string, St.Widget, St.Widget]) => {
                const [title, cat_icon, icon] = element;

                cat_icon.set_y_align(Clutter.ActorAlign.CENTER);
                icon.set_y_align(Clutter.ActorAlign.CENTER);

                let label = new St.Label({
                    text: title,
                    styleClass: "pop-shell-search-label",
                    y_align: Clutter.ActorAlign.CENTER
                });

                label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

                let container = new widgets.Box({ styleClass: "pop-shell-search-element" })
                    .add(cat_icon)
                    .add(icon)
                    .add(label)
                    .container;

                this.widgets.push(container);
                this.list.add(container);
            },
            () => this.list.add(Lib.separator())
        );

        this.list.show();
        if (this.widgets.length != 0) {
            this.select();
            this.select_cb(0);
        }
    }

    set_text(text: string) {
        this.text.set_text(text);
    }

    private has_prefix(text: string): number {
        return this.ignore_prefixes.findIndex((p) => text.startsWith(p));
    }
}
