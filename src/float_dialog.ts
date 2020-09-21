// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as arena from 'arena';
import * as Lib from 'lib';

const { Arena } = arena;

const { Clutter, St } = imports.gi;
const { ModalDialog } = imports.ui.modalDialog;

import type { Arena as ArenaT } from 'arena';
import type { Config, FloatRule } from 'config';

function legends(): St.Widget {
    let c = new St.BoxLayout({ vertical: false });
    let l = (c as any).get_layout_manager();
    if (l) {
        l.set_homogeneous(true);
        l.spacing = 4;
    }

    c.add(new St.Label({
        text: "WM Class",
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        style: "font-size: 12pt; font-weight: bold"
    }));

    c.add(new St.Label({
        text: "WM Title",
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        style: "font-size: 12pt; font-weight: bold"
    }));
    return c;
}

export class FloatDialog {
    private dialog: Shell.ModalDialog = new ModalDialog({
        destroyOnClose: true,
        shellReactive: true,
        shouldFadeIn: false,
        shouldFadeOut: false
    });

    private list: St.BoxLayout = new St.BoxLayout({
        vertical: true
    });

    private entries: ArenaT<FloatEntry> = new Arena();

    private config: Config;

    constructor(config: Config) {
        this.config = config;

        for (const rule of config.float) {
            this.add_entry(rule);
        }

        let inner = new St.BoxLayout({ vertical: true });

        inner.add(this.list);

        let add_entry = new St.Button({
            child: new St.Icon({
                icon_name: "list-add",
                icon_size: 24
            })
        });

        add_entry.connect("clicked", () => this.add_entry());

        inner.add(add_entry);

        let cl = this.dialog.contentLayout;

        cl.add(new St.Label({
            text: "Floating Rules",
            x_align: Clutter.ActorAlign.CENTER,
            style: "font-size: 16pt; font-weight: bold"
        }));

        let scroll_view = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
        });

        scroll_view.add_actor(inner);

        cl.add(legends());
        cl.add(scroll_view);

        cl.width = Math.max(Lib.current_monitor().width / 4, 640);

        this.dialog.addButton({
            label: "Cancel",
            action: this.close.bind(this),
            key: Clutter.KEY_Escape
        });

        this.dialog.addButton({
            label: "Save",
            action: this.save.bind(this),
            key: Clutter.KEY_S,
        })
    }

    private add_entry(rule?: FloatRule) {
        let entry = new FloatEntry();

        if (rule) {
            if (rule.class) entry.set_class(rule.class);
            if (rule.title) entry.set_title(rule.title);
        }

        this.list.add(entry.container);

        let id = this.entries.insert(entry);

        entry.connect_destroy(() => {
            entry.container.destroy();
            this.entries.remove(id);
        });
    }

    open() {
        this.dialog.open(global.get_current_time(), true)
    }

    save() {
        this.config.float.splice(0);

        for (const entry of this.entries.values()) {
            let wm_class = entry.class();
            let wm_title = entry.title();

            let rule: FloatRule = {};

            if (wm_class.length !== 0) rule.class = wm_class;
            if (wm_title.length !== 0) rule.title = wm_title;

            if (rule.class || rule.title) {
                this.config.float.push(rule);
            }
        }

        this.config.sync_to_disk();
        this.close();
    }

    close() {
        this.dialog.close(global.get_current_time())
    }
}

class FloatEntry {
    container: St.BoxLayout;
    wm_title: St.Entry;
    wm_class: St.Entry;

    constructor() {
        this.wm_class = new St.Entry({ x_expand: true, style: "margin: 8px" });
        this.wm_title = new St.Entry({ x_expand: true, style: "margin: 8px" });

        let inner = new St.BoxLayout({ vertical: false, x_expand: true });

        let l = (inner as any).get_layout_manager();
        if (l) {
            l.set_homogeneous(true);
            l.spacing = 4;
        }

        inner.add(this.wm_class);
        inner.add(this.wm_title);

        this.container = new St.BoxLayout({ vertical: false });
        this.container.add(inner);
    }

    connect_destroy(func: () => void) {
        let button = new St.Button({
            child: new St.Icon({
                icon_name: "edit-delete",
                icon_size: 24
            })
        });

        button.connect('clicked', func);

        this.container.add(button);
    }

    class(): string {
        return this.wm_class.get_clutter_text().get_text().trim();
    }

    set_class(c: string): void {
        this.wm_class.get_clutter_text().set_text(c);
    }

    title(): string {
        return this.wm_title.get_clutter_text().get_text().trim();
    }

    set_title(t: string): void {
        this.wm_title.get_clutter_text().set_text(t);
    }
}