// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';

const { Clutter, St } = imports.gi;
const { ModalDialog } = imports.ui.modalDialog;

export class Search {
    dialog: Shell.ModalDialog = new ModalDialog({
        styleClass: "pop-shell-search modal-dialog",
        destroyOnClose: false,
        shellReactive: true,
        shouldFadeIn: false,
        shouldFadeOut: false
    });

    private active_id: number;
    private mode_prefixes: Array<string>;
    private entry: St.Entry;
    private list: St.Widget;
    private text: Clutter.Text;
    private widgets: Array<St.Widget>;

    private apply_cb: (text: string, index: number) => boolean;
    private cancel_cb: () => void;
    private select_cb: (id: number) => void;

    constructor(
        mode_prefixes: Array<string>,
        cancel: () => void,
        search: (pattern: string) => Array<St.Widget> | null,
        select: (id: number) => void,
        apply: (text: string, index: number) => boolean,
        mode: (id: number) => void,
    ) {
        this.apply_cb = apply;
        this.cancel_cb = cancel;
        this.select_cb = select;

        this.active_id = 0;
        this.mode_prefixes = mode_prefixes;
        this.widgets = [];

        this.entry = new St.Entry({
            can_focus: true,
            x_expand: true
        });

        this.text = this.entry.get_clutter_text();
        this.dialog.setInitialKeyFocus(this.text);

        this.text.connect("activate", () => this.activate_option(this.active_id));

        this.text.connect("text-changed", (entry: any) => {
            this.clear();

            const text = (entry as Clutter.Text).get_text().trim();

            let prefix = this.has_prefix(text);
            mode(prefix);

            const update = search((prefix === -1) ? text.toLowerCase() : text);
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
            if (c == 65362 || (s == Clutter.ModifierType.CONTROL_MASK && c == 107) || (s == Clutter.ModifierType.CONTROL_MASK && c == 112)) {
                // Up arrow was pressed
                if (0 < this.active_id) {
                    this.select_id(this.active_id - 1)
                }
                else if (this.active_id == 0) {
                    this.select_id(this.widgets.length - 1)
                }
            } else if (c == 65364 || (s == Clutter.ModifierType.CONTROL_MASK && c == 106) || (s == Clutter.ModifierType.CONTROL_MASK && c == 110)) {
                // Down arrow was pressed
                if (this.active_id + 1 < this.widgets.length) {
                    this.select_id(this.active_id + 1)
                }
                else if (this.active_id + 1 == this.widgets.length) {
                    this.select_id(0)
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

    activate_option(id: number) {
        const cont = this.apply_cb(this.get_text(), id);

        if (!cont) {
            this.reset();
            this.close();
            this.cancel_cb();
        }
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

    get_text(): string {
        return this.text.get_text();
    }

    icon_size() {
        return 34;
    }

    list_max() {
        return 8;
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

    select_id(id: number) {
        this.unselect();
        this.active_id = id;
        this.select();
    }

    unselect() {
        this.widgets[this.active_id].remove_style_pseudo_class(
            "select"
        );
    }

    update_search_list(list: Array<St.Widget>) {
        Lib.join(
            list.values(),
            (button: St.Widget) => {
                const id = this.widgets.length;

                button.connect('clicked', () => this.activate_option(id))
                button.connect('notify::hover', () => {
                    this.select_id(id)
                    this.select_cb(id)
                })

                this.widgets.push(button);
                this.list.add(button);

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
        return this.mode_prefixes.findIndex((p) => text.startsWith(p));
    }
}
