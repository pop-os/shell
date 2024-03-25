import * as Lib from './lib.js';
import * as rect from './rectangle.js';

import type { JsonIPC } from './launcher_service.js';

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Gdk from 'gi://Gdk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ModalDialog } from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const { overview, wm } = Main;
import { Overview } from 'resource:///org/gnome/shell/ui/overview.js';

let overview_toggle: any = null;

export class Search {
    dialog: Shell.ModalDialog = new ModalDialog({
        styleClass: 'pop-shell-search modal-dialog',
        destroyOnClose: false,
        shellReactive: true,
        shouldFadeIn: false,
        shouldFadeOut: false,
    });

    active_id: number;

    private entry: St.Entry;
    private list: St.Widget;
    private text: Clutter.Text;
    private widgets: Array<St.Widget>;
    private scroller: St.Widget;
    private children_to_abandon: any = null;
    private last_trigger: number = 0;

    /** Output of `Main.pushModal`; Input to `Main.popModal()` */
    private grab_handle: any = null;

    activate_id: (index: number) => void = () => {};
    cancel: () => void = () => {};
    complete: () => void = () => {};
    search: (search: string) => void = () => {};
    select: (id: number) => void = () => {};
    quit: (id: number) => void = () => {};
    copy: (id: number) => void = () => {};

    constructor() {
        this.active_id = 0;
        this.widgets = [];
        this.entry = new St.Entry({
            style_class: 'pop-shell-entry',
            can_focus: true,
            x_expand: true,
        });

        this.entry.set_hint_text("  Type to search apps, or type '?' for more options.");

        this.text = this.entry.get_clutter_text();
        (this.text as any).set_use_markup(true);
        this.dialog.setInitialKeyFocus(this.text);

        let text_changed: null | number = null;

        this.text.connect('activate', () => this.activate_id(this.active_id));

        this.text.connect('text-changed', (entry: any) => {
            if (text_changed !== null) GLib.source_remove(text_changed);

            const text = (entry as Clutter.Text).get_text().trim();

            const update = () => {
                this.clear();
                this.search(text);
            };

            if (text.length === 0) {
                update();
                return;
            }

            text_changed = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
                text_changed = null;
                update();
                return false;
            });
        });

        this.text.connect('key-press-event', (_: any, event: any) => {
            const key = Gdk.keyval_name(Gdk.keyval_to_upper(event.get_key_symbol()));
            const ctrlKey = Boolean(event.get_state() & Clutter.ModifierType.CONTROL_MASK);

            const is_down = (): boolean => {
                return key === 'Down' || (ctrlKey && key === 'J') || (ctrlKey && key === 'N');
            };

            const is_up = (): boolean => {
                return key === 'Up' || key === 'ISO_Left_Tab' || (ctrlKey && key === 'K') || (ctrlKey && key === 'P');
            };

            // Up arrow or left tab was pressed
            const up_arrow = () => {
                if (0 < this.active_id) {
                    this.select_id(this.active_id - 1);
                } else if (this.active_id == 0) {
                    this.select_id(this.widgets.length - 1);
                }
            };

            // Down arrow or tab was pressed
            const down_arrow = () => {
                if (this.active_id + 1 < this.widgets.length) {
                    this.select_id(this.active_id + 1);
                } else if (this.active_id + 1 == this.widgets.length) {
                    this.select_id(0);
                }
            };

            // Delay key repeat events, and handle up/down arrow movements if on repeat.
            if (event.get_flags() != Clutter.EventFlags.NONE) {
                const now = global.get_current_time();

                if (now - this.last_trigger < 100) {
                    return;
                }

                this.last_trigger = now;

                if (is_up()) {
                    up_arrow();
                    this.select(this.active_id);
                } else if (is_down()) {
                    down_arrow();
                    this.select(this.active_id);
                }

                return;
            }

            this.last_trigger = global.get_current_time();

            if (key === 'Escape') {
                // Escape key was pressed
                this.reset();
                this.close();
                this.cancel();
                return;
            } else if (key === 'Tab') {
                // Tab was pressed, check for tab completion
                this.complete();
                return;
            }

            if (is_up()) {
                up_arrow();
            } else if (is_down()) {
                down_arrow();
            } else if (ctrlKey && key === '1') {
                this.activate_id(0);
                return;
            } else if (ctrlKey && key === '2') {
                this.activate_id(1);
                return;
            } else if (ctrlKey && key === '3') {
                this.activate_id(2);
                return;
            } else if (ctrlKey && key === '4') {
                this.activate_id(3);
                return;
            } else if (ctrlKey && key === '5') {
                this.activate_id(4);
                return;
            } else if (ctrlKey && key === '6') {
                this.activate_id(5);
                return;
            } else if (ctrlKey && key === '7') {
                this.activate_id(6);
                return;
            } else if (ctrlKey && key === '8') {
                this.activate_id(7);
                return;
            } else if (ctrlKey && key === '9') {
                this.activate_id(8);
                return;
            } else if (ctrlKey && key === 'Q') {
                // Ctrl + Q shall quit the selected application
                this.quit(this.active_id);
                return;
            } else if (key === 'Copy' || (ctrlKey && (key === 'C' || key === 'Insert'))) {
                if ((this.text as any).get_selection()) {
                    // If text entry has selected text, behave as normal
                    return;
                } else {
                    // If nothing is selected, copy the active option and close
                    this.copy(this.active_id);
                    this.close();
                    this.cancel();
                }
            }

            this.select(this.active_id);
        });

        this.list = new St.BoxLayout({
            styleClass: 'pop-shell-search-list',
            vertical: true,
        });

        const scroller = new St.ScrollView();
        scroller.add_child(this.list);

        this.dialog.contentLayout.add_child(this.entry);
        this.dialog.contentLayout.add_child(scroller);

        this.scroller = scroller;

        // Ensure that the width is at least 640 pixels wide.
        this.dialog.contentLayout.width = Math.max(Lib.current_monitor().width / 4, 640);

        this.dialog.connect('event', (_actor: any, event: any) => {
            const { width, height } = this.dialog.dialogLayout._dialog;
            const { x, y } = this.dialog.dialogLayout;
            const area = new rect.Rectangle([x, y, width, height]);

            const close =
                this.dialog.visible &&
                event.type() == Clutter.EventType.BUTTON_PRESS &&
                !area.contains(Lib.cursor_rect());

            if (close) {
                this.reset();
                this.close();
                this.cancel();
            }

            return Clutter.EVENT_PROPAGATE;
        });

        this.dialog.connect('closed', () => this.cancel());
    }

    cleanup() {
        if (this.children_to_abandon) {
            for (const child of this.children_to_abandon) {
                child.destroy();
            }
            this.children_to_abandon = null;
        }
    }

    clear() {
        this.children_to_abandon = (this.list as any).get_children();
        this.widgets = [];
        this.active_id = 0;
    }

    close() {
        try {
            if (this.grab_handle !== null) {
                Main.popModal(this.grab_handle);
                this.grab_handle = null;
            }
        } catch (error) {
            // global.logError(error);
        }

        this.reset();
        this.remove_injections();

        this.dialog.close(global.get_current_time());

        wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
    }

    _open(timestamp: number, on_primary: boolean) {
        this.grab_handle = Main.pushModal(this.dialog.dialogLayout);
        this.dialog.open(timestamp, on_primary);

        wm.allowKeybinding('overlay-key', Shell.ActionMode.ALL);

        overview_toggle = Overview.prototype['toggle'];

        Overview.prototype['toggle'] = () => {
            if (this.dialog.is_visible()) {
                this.reset();
                this.close();
                this.cancel();
            } else {
                this.remove_injections();
                overview.toggle();
            }
        };
    }

    get_text(): string {
        return this.text.get_text();
    }

    icon_size() {
        return 34;
    }

    get list_max() {
        return 7;
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

    highlight_selected() {
        const widget = this.widgets[this.active_id];
        if (widget) {
            widget.add_style_pseudo_class('select');

            try {
                Util.ensureActorVisibleInScrollView(this.scroller, widget);
            } catch (_error) {}
        }
    }

    select_id(id: number) {
        this.unselect();
        this.active_id = id;
        this.highlight_selected();
    }

    unselect() {
        this.widgets[this.active_id]?.remove_style_pseudo_class('select');
    }

    append_search_option(option: SearchOption) {
        const id = this.widgets.length;

        if (id !== 0) {
            this.list.add_child(Lib.separator());
        }

        const { widget, shortcut } = option;

        if (id < 9) {
            (shortcut as any).set_text(`Ctrl + ${id + 1}`);
            (shortcut as any).show();
        } else {
            (shortcut as any).hide();
        }

        let initial_cursor = Lib.cursor_rect();

        widget.connect('clicked', () => this.activate_id(id));
        widget.connect('notify::hover', () => {
            const { x, y } = Lib.cursor_rect();
            if (x === initial_cursor.x && y === initial_cursor.y) return;
            this.select_id(id);
            this.select(id);
        });

        this.widgets.push(widget);
        this.list.add_child(widget);

        this.cleanup();

        this.list.show();

        const vscroll = (this.scroller as any).get_vscroll_bar();
        if ((this.scroller as any).vscrollbar_visible) {
            vscroll.show();
        } else {
            vscroll.hide();
        }

        if (id === 0) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.highlight_selected();
                this.select(0);
                return false;
            });
        }
    }

    set_text(text: string) {
        this.text.set_text(text);
    }

    remove_injections() {
        if (overview_toggle !== null) {
            Overview.prototype['toggle'] = overview_toggle;
            overview_toggle = null;
        }
    }
}

export class SearchOption {
    title: string;
    description: null | string;
    exec: null | string;
    keywords: null | Array<string>;

    widget: St.Button;

    shortcut: St.Widget = new St.Label({
        text: '',
        y_align: Clutter.ActorAlign.CENTER,
        style: 'padding-left: 6px;padding-right: 6px',
    });

    constructor(
        title: string,
        description: null | string,
        category_icon: null | JsonIPC.IconSource,
        icon: null | JsonIPC.IconSource,
        icon_size: number,
        exec: null | string,
        keywords: null | Array<string>,
    ) {
        this.title = title;
        this.description = description;
        this.exec = exec;
        this.keywords = keywords;

        const layout = new St.BoxLayout({});

        attach_icon(layout, category_icon, icon_size / 2);

        const label = new St.Label({ text: title });
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

        attach_icon(layout, icon, icon_size);

        const info_box = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            vertical: true,
            x_expand: true,
        });
        info_box.add_child(label);

        if (description) {
            info_box.add_child(new St.Label({ text: description, style: 'font-size: small' }));
        }

        layout.add_child(info_box);
        layout.add_child(this.shortcut);

        this.widget = new St.Button({ style_class: 'pop-shell-search-element' });
        (this.widget as any).add_child(layout);
    }
}

function attach_icon(layout: any, icon: null | JsonIPC.IconSource, icon_size: number) {
    if (icon) {
        const generated = generate_icon(icon, icon_size);

        if (generated) {
            generated.set_y_align(Clutter.ActorAlign.CENTER);
            layout.add_child(generated);
        }
    }
}

function generate_icon(icon: JsonIPC.IconSource, icon_size: number): null | St.Widget {
    let app_icon = null;

    if ('Name' in icon) {
        const file = Gio.File.new_for_path(icon.Name);

        if (file.query_exists(null)) {
            app_icon = new St.Icon({
                gicon: Gio.icon_new_for_string(icon.Name),
                icon_size,
            });
        } else {
            app_icon = new St.Icon({
                icon_name: icon.Name,
                icon_size,
            });
        }
    } else if ('Mime' in icon) {
        app_icon = new St.Icon({
            gicon: Gio.content_type_get_icon(icon.Mime),
            icon_size,
        });
    }

    if (app_icon) {
        (app_icon as any).style_class = 'pop-shell-search-icon';
    }

    return app_icon;
}
