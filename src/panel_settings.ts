const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as auto_tiler from 'auto_tiler';
import * as Log from 'log';

import type { Entity } from './ecs';
import type { Ext } from './extension';

const { Clutter, Gio, St } = imports.gi;
const { PopupBaseMenuItem, PopupMenuItem, PopupSwitchMenuItem, PopupSeparatorMenuItem } = imports.ui.popupMenu;
const { Button } = imports.ui.panelMenu;
const { Forest } = Me.imports.forest;
const GLib: GLib = imports.gi.GLib;

export class Indicator {
    button: any;
    appearances: any;

    constructor(ext: Ext) {
        this.button = new Button(0.0, _("Pop Shell Settings"));

        const icon_path = `${Me.path}/icons/pop-shell-symbolic.svg`;
        this.button.icon = new St.Icon({
            gicon: Gio.icon_new_for_string(icon_path),
            style_class: "system-status-icon",
        });

        this.button.add_actor(this.button.icon);

        this.button.menu.addMenuItem(tiled(ext));
        this.button.menu.addMenuItem(menu_separator(''));

        this.button.menu.addMenuItem(shortcuts(this.button.menu));
        this.button.menu.addMenuItem(settings_button(this.button.menu));
        this.button.menu.addMenuItem(menu_separator(''));

        this.button.menu.addMenuItem(
            toggle(
                _("Show Active Hint"),
                ext.settings.active_hint(),
                (toggle) => {
                    ext.settings.set_active_hint(toggle.state);
                }
            )
        );

        this.button.menu.addMenuItem(
            number_entry(
                _("Gaps"),
                ext.settings.gap_inner(),
                (value) => {
                    ext.settings.set_gap_inner(value);
                    ext.settings.set_gap_outer(value);
                }
            )
        )
    }
}

function menu_separator(text: any): any {
    return new PopupSeparatorMenuItem(text);
}

function settings_button(menu: any): any {

    let item = new PopupMenuItem(_('View All'));
    item.connect('activate', () => {
        let path: string | null = GLib.find_program_in_path('pop-shell-shortcuts');
        if (path) {
            imports.misc.util.spawn([path]);
        } else {
            Log.error(`You must install \`pop-shell-shortcuts\``)
        }

        menu.close();
    })

    item.label.get_clutter_text().set_margin_left(12);

    return item;
}

function shortcuts(menu: any): any {
    let layout_manager = new Clutter.GridLayout({ orientation: Clutter.Orientation.HORIZONTAL });
    let widget = new St.Widget({ layout_manager, x_expand: true });

    let item = new PopupBaseMenuItem();
    item.connect('activate', () => {
        let path: string | null = GLib.find_program_in_path('pop-shell-shortcuts');
        if (path) {
            imports.misc.util.spawn([path]);
        } else {
            Log.error(`You must install \`pop-shell-shortcuts\``)
        }

        menu.close();
    })
    item.add_child(widget);

    function create_label(text: string): any {
        return new St.Label({ text });
    }

    function create_shortcut_label(text: string): any {
        let label = create_label(text);
        label.set_x_align(Clutter.ActorAlign.END);
        return label;
    }

    let launcher = create_label(_('Launcher'));
    launcher.get_clutter_text().set_margin_left(12);
    let navigate_windows = create_label(_('Navigate Windows'));
    navigate_windows.get_clutter_text().set_margin_left(12);

    // Shortcut items
    let launcher_shortcut = create_shortcut_label(_('Super + /'));
    let navigate_windows_shortcut = create_shortcut_label(_('Super + Arrow Keys'));

    layout_manager.set_row_spacing(12);
    layout_manager.set_column_spacing(30);
    layout_manager.attach(create_label(_('Shortcuts')), 0, 0, 2, 1);
    layout_manager.attach(launcher, 0, 1, 1, 1);
    layout_manager.attach(launcher_shortcut, 1, 1, 1, 1);
    layout_manager.attach(navigate_windows, 0, 2, 1, 1);
    layout_manager.attach(navigate_windows_shortcut, 1, 2, 1, 1);

    return item;
}

function clamp(input: number): number {
    return Math.min(Math.max(0, input), 128);
}

function number_entry(
    label: string,
    value: number,
    callback: (a: number) => void,
): any {
    let entry = new St.Entry({ text: String(value) });
    entry.set_input_purpose(Clutter.InputContentPurpose.NUMBER);
    entry.set_x_align(Clutter.ActorAlign.END);
    entry.set_x_expand(false);
    entry.set_style_class_name('pop-shell-gaps-entry');
    entry.connect('button-release-event', () => {
        return true;
    });

    let text = entry.clutter_text;
    text.set_max_length(3);

    entry.connect('key-release-event', (_: any, event: any) => {
        const symbol = event.get_key_symbol();

        const number: number | null =
            symbol == 65293     // enter key
                ? parse_number(text.text)
                : symbol == 65361   // left key
                    ? clamp(parse_number(text.text) - 1)
                    : symbol == 65363   // right key
                        ? clamp(parse_number(text.text) + 1)
                        : null;

        if (number !== null) {
            text.set_text(String(number));
        }
    });


    let plus_button = new St.Icon();
    plus_button.set_icon_name('value-increase');
    plus_button.set_icon_size(16);
    plus_button.connect('button-press-event', (_: any, event: any) => {
        event.get_key_symbol();
        let value = parseInt(text.get_text());
        value = clamp(value + 1);
        text.set_text(String(value));
    })

    let minus_button = new St.Icon();
    minus_button.set_icon_name('value-decrease');
    minus_button.set_icon_size(16);
    minus_button.connect('button-press-event', (_: any, event: any) => {
        event.get_key_symbol();
        let value = parseInt(text.get_text());
        value = clamp(value - 1);
        text.set_text(String(value));
    })

    // Secondary is the one on the right, primary on the left.
    entry.set_secondary_icon(plus_button);
    entry.set_primary_icon(minus_button);

    text.connect('text-changed', () => {
        const input: string = text.get_text();
        const last = input.slice(-1);
        let parsed = parseInt(last);

        if (isNaN(parsed)) {
            text.set_text(input.substr(0, input.length - 1));
            parsed = 0;
        }

        callback(parsed);
    });

    let item = new PopupMenuItem(label);
    item.label.get_clutter_text().set_x_expand(true);
    item.label.set_y_align(Clutter.ActorAlign.CENTER);
    item.add_child(entry);

    return item;
}

function parse_number(text: string): number {
    let number = parseInt(text, 10);
    if (isNaN(number)) {
        number = 0;
    }

    return number;
}

function toggle(desc: string, active: boolean, connect: (toggle: any) => void): any {
    let toggle = new PopupSwitchMenuItem(desc, active);

    toggle.label.set_y_align(Clutter.ActorAlign.CENTER);

    toggle.connect('toggled', () => {
        connect(toggle);

        return true;
    });

    return toggle;
}

function tiled(ext: Ext): any {
    return toggle(_("Tile Windows"), null != ext.auto_tiler, () => {
        if (ext.auto_tiler) {
            Log.info(`tile by default disabled`);
            ext.unregister_storage(ext.auto_tiler.attached);
            ext.auto_tiler = null;
            ext.settings.set_tile_by_default(false);
        } else {
            Log.info(`tile by default enabled`);

            const original = ext.active_workspace();

            let tiler = new auto_tiler.AutoTiler(
                new Forest()
                    .connect_on_attach((entity: Entity, window: Entity) => {
                        tiler.attached.insert(window, entity);
                    }),
                ext.register_storage()
            );

            ext.auto_tiler = tiler;

            ext.settings.set_tile_by_default(true);

            for (const window of ext.windows.values()) {
                if (window.is_tilable(ext)) tiler.auto_tile(ext, window, false);
            }

            ext.register_fn(() => ext.switch_to_workspace(original));
        }
    });
}
