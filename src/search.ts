// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';
import * as rect from 'rectangle';

import type { Ext } from 'extension'
import type { JsonIPC } from 'launcher_service'

const GLib: GLib = imports.gi.GLib;

const { Clutter, Gio, Pango, Shell, St } = imports.gi;
const { ModalDialog } = imports.ui.modalDialog;

const { overview, wm } = imports.ui.main;
const { Overview } = imports.ui.overview;

let overview_toggle: any = null

export class Search {
    dialog: Shell.ModalDialog = new ModalDialog({
        styleClass: "pop-shell-search modal-dialog",
        destroyOnClose: false,
        shellReactive: true,
        shouldFadeIn: false,
        shouldFadeOut: false
    });

    active_id: number;

    private entry: St.Entry;
    private list: St.Widget;
    private text: Clutter.Text;
    private widgets: Array<St.Widget>;
    private scroller: St.Widget;
    private children_to_abandon: any = null;
    private last_trigger: number = 0;

    activate_id: (index: number) => void = () => {}
    cancel: () => void = () => {}
    complete: () => void = () => {}
    search: (search: string) => void = () => {}
    select: (id: number) => void = () => {}
    quit: (id: number) => void = () => {}

    constructor() {
        this.active_id = 0;
        this.widgets = [];
        this.entry = new St.Entry({
            style_class: "pop-shell-entry",
            can_focus: true,
            x_expand: true
        });

        this.entry.set_hint_text("  Type to search apps, or type '?' for more options.")

        this.text = this.entry.get_clutter_text();
        (this.text as any).set_use_markup(true)
        this.dialog.setInitialKeyFocus(this.text);

        let text_changed: null | number = null;

        this.text.connect("activate", () => this.activate_id(this.active_id));

        this.text.connect("text-changed", (entry: any) => {
            if (text_changed !== null) GLib.source_remove(text_changed)

            const text = (entry as Clutter.Text).get_text().trim()

            const update = () => {
                this.clear()
                this.search(text)
            }

            if (text.length === 0) {
                update()
                return
            }

            text_changed = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
                text_changed = null
                update()
                return false;
            })
        });

        this.text.connect("key-press-event", (_: any, event: any) => {
            const c = event.get_key_symbol();
            const s = event.get_state();

            const is_down = (): boolean => {
                return c == 65364 || c == 65289 || (s == Clutter.ModifierType.CONTROL_MASK && c == 106)
                    || (s == Clutter.ModifierType.CONTROL_MASK && c == 110)
            }

            const is_up = (): boolean => {
                return c == 65362 || c == 65056 || (s == Clutter.ModifierType.CONTROL_MASK && c == 107)
                    || (s == Clutter.ModifierType.CONTROL_MASK && c == 112)
            }

            // Up arrow or left tab was pressed
            const up_arrow = () => {
                if (0 < this.active_id) {
                    this.select_id(this.active_id - 1)
                } else if (this.active_id == 0) {
                    this.select_id(this.widgets.length - 1)
                }
            }

            // Down arrow or tab was pressed
            const down_arrow = () => {
                if (this.active_id + 1 < this.widgets.length) {
                    this.select_id(this.active_id + 1)
                } else if (this.active_id + 1 == this.widgets.length) {
                    this.select_id(0)
                }
            }

            // Delay key repeat events, and handle up/down arrow movements if on repeat.
            if (event.get_flags() != Clutter.EventFlags.NONE) {
                const now = global.get_current_time()

                if (now - this.last_trigger < 100) {
                    return
                }

                this.last_trigger = now;

                if (is_up()) {
                    up_arrow()
                    this.select(this.active_id);
                } else if (is_down()) {
                    down_arrow()
                    this.select(this.active_id);
                }

                return;
            }

            this.last_trigger = global.get_current_time()
            
            if (c === 65307) {
                // Escape key was pressed
                this.reset();
                this.close();
                this.cancel();
                return;
            } else if (c === 65289) {
                // Tab was pressed, check for tab completion
                this.complete()
                return;
            }

            if (is_up()) {
                up_arrow()
            } else if (is_down()) {
                down_arrow()
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 49) {
                this.activate_id(0)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 50) {
                this.activate_id(1)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 51) {
                this.activate_id(2)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 52) {
                this.activate_id(3)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 53) {
                this.activate_id(4)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 54) {
                this.activate_id(5)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 55) {
                this.activate_id(6)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 56) {
                this.activate_id(7)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 57) {
                this.activate_id(8)
                return
            } else if (s == Clutter.ModifierType.CONTROL_MASK && c == 113) {
                // Ctrl + Q shall quit the selected application
                this.quit(this.active_id)
                return
            }

            this.select(this.active_id);
        });

        this.list = new St.BoxLayout({
            styleClass: "pop-shell-search-list",
            vertical: true,
        });

        const scroller = new St.ScrollView()
        scroller.add_actor(this.list)

        this.dialog.contentLayout.add(this.entry);
        this.dialog.contentLayout.add(scroller);

        this.scroller = scroller

        // Ensure that the width is at least 640 pixels wide.
        this.dialog.contentLayout.width = Math.max(Lib.current_monitor().width / 4, 640);

        const id = global.stage.connect('event', (_actor: any, event: any) => {
            const { width, height } = this.dialog.dialogLayout._dialog;
            const { x, y } = this.dialog.dialogLayout
            const area = new rect.Rectangle([x, y, width, height]);

            const close = this.dialog.visible
                && (event.type() == Clutter.EventType.BUTTON_PRESS)
                && !area.contains(Lib.cursor_rect())

            if (close) {
                this.reset()
                this.close()
                this.cancel()
            }

            return Clutter.EVENT_PROPAGATE;
        })

        this.dialog.connect('closed', () => this.cancel())
        this.dialog.connect('destroy', () => global.stage.disconnect(id))
    }

    cleanup() {
        if (this.children_to_abandon) {
            for (const child of this.children_to_abandon) {
                child.destroy();
            }
            this.children_to_abandon = null
        }
    }

    clear() {
        this.children_to_abandon = (this.list as any).get_children();
        this.widgets = [];
        this.active_id = 0;
    }

    close() {
        this.reset()
        this.remove_injections()

        this.dialog.close(global.get_current_time())

        wm.allowKeybinding('overlay-key', Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW)
    }

    _open(timestamp: number, on_primary: boolean) {
        this.dialog.open(timestamp, on_primary)

        wm.allowKeybinding('overlay-key', Shell.ActionMode.ALL)

        overview_toggle = Overview.prototype['toggle']

        Overview.prototype['toggle'] = () => {
            if (this.dialog.is_visible()) {
                this.reset();
                this.close();
                this.cancel();
            } else {
                this.remove_injections()
                overview.toggle()
            }
        }
    }

    get_text(): string {
        return this.text.get_text();
    }

    icon_size() {
        return 34;
    }

    get list_max() { return 7 }

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
        const widget = this.widgets[this.active_id]
        if (widget) {
            widget.add_style_pseudo_class("select")

            try {
                imports.misc.util.ensureActorVisibleInScrollView(this.scroller, widget)
            } catch (_error) {

            }
        }
    }

    select_id(id: number) {
        this.unselect();
        this.active_id = id;
        this.highlight_selected();
    }

    unselect() {
        this.widgets[this.active_id]?.remove_style_pseudo_class("select");
    }

    append_search_option(option: SearchOption) {
        const id = this.widgets.length

        if (id !== 0) {
            this.list.add(Lib.separator())
        }

        const { widget, shortcut } = option;

        if (id < 9) {
            (shortcut as any).set_text(`Ctrl + ${id + 1}`);
            (shortcut as any).show()
        } else {
            (shortcut as any).hide()
        }

        let initial_cursor = Lib.cursor_rect()

        widget.connect('clicked', () => this.activate_id(id))
        widget.connect('notify::hover', () => {
            const { x, y } = Lib.cursor_rect()
            if ( x === initial_cursor.x && y === initial_cursor.y) return
            this.select_id(id)
            this.select(id)
        })

        this.widgets.push(widget);
        this.list.add(widget);

        this.cleanup()

        this.list.show();

        const vscroll = (this.scroller as any).get_vscroll_bar()
        if ((this.scroller as any).vscrollbar_visible) {
            vscroll.show()
        } else {
            vscroll.hide()
        }

        if (id === 0) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.highlight_selected();
                this.select(0);
                return false
            })
        }
    }

    set_text(text: string) {
        this.text.set_text(text);
    }

    remove_injections() {
        if (overview_toggle !== null) {
            Overview.prototype['toggle'] = overview_toggle
            overview_toggle = null
        }
    }
}

export class SearchOption {
    title: string
    description: null | string
    exec: null | string
    keywords: null | Array<string>

    widget: St.Button

    shortcut: St.Widget = new St.Label({ text: "", y_align: Clutter.ActorAlign.CENTER, style: "padding-left: 6px;padding-right: 6px" })

    constructor(ext: Ext, title: string, description: null | string, category_icon: null | JsonIPC.IconSource, icon: null | JsonIPC.IconSource, icon_size: number,
                exec: null | string, keywords: null | Array<string>) {
        this.title = title
        this.description = description
        this.exec = exec
        this.keywords = keywords

        const layout = new St.BoxLayout({})

        attach_icon(layout, category_icon, icon_size / 2, ext)

        const label = new St.Label({ text: title })
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END)

        attach_icon(layout, icon, icon_size, ext)

        const info_box = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, vertical: true, x_expand: true });
        info_box.add_child(label)

        if (description) {
            info_box.add_child(new St.Label({ text: description, style: "font-size: small" }))
        }

        layout.add_child(info_box)
        layout.add_child(this.shortcut)

        this.widget = new St.Button({ style_class: "pop-shell-search-element" });
        (this.widget as any).add_actor(layout)
    }
}

function attach_icon(layout: any, icon: null | JsonIPC.IconSource, icon_size: number, ext: Ext) {
    if (icon) {
        const generated = generate_icon(icon, icon_size, ext)

        if (generated) {
            generated.set_y_align(Clutter.ActorAlign.CENTER)
            layout.add_child(generated)
        }
    }
}

function generate_icon(icon: JsonIPC.IconSource, icon_size: number, ext: Ext): null | St.Widget {
    let app_icon = null;

    if ("Name" in icon) {
        const file = Gio.File.new_for_path(icon.Name)

        if (file.query_exists(null)) {
            app_icon = new St.Icon({
                gicon: Gio.icon_new_for_string(icon.Name),
                icon_size,
            })
        } else {
            app_icon = new St.Icon({
                icon_name: icon.Name,
                icon_size,
            })
        }
    } else if ("Mime" in icon) {
        app_icon = new St.Icon({
            gicon: Gio.content_type_get_icon(icon.Mime),
            icon_size,
        })
    } else if ("Window" in icon) {
        const window = ext.windows.get(icon.Window);
        if (window) {
            app_icon = window.icon(ext, icon_size);
        }
    }

    if (app_icon) {
        (app_icon as any).style_class = "pop-shell-search-icon"
    }

    return app_icon
}