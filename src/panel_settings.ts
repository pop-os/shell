const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as auto_tiler from 'auto_tiler';
import * as Log from 'log';

import type { Entity } from './ecs';
import type { Ext } from './extension';

const { Clutter, Gio, St } = imports.gi;
const { PopupMenuItem, PopupSwitchMenuItem, PopupSubMenuMenuItem } = imports.ui.popupMenu;
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

        this.appearances = new PopupSubMenuMenuItem('Appearance', true);
        this.appearances.icon.icon_name = 'preferences-desktop-display-symbolic';
        this.button.menu.addMenuItem(this.appearances);

        this.appearances.menu.addMenuItem(
            toggle(
                _("Show Active Hint"),
                ext.settings.active_hint(),
                (toggle) => {
                    ext.settings.set_active_hint(toggle.state);
                }
            )
        );

        this.appearances.menu.addMenuItem(
            number_entry(
                _("Gaps"),
                ext.settings.gap_inner(),
                (value) => {
                    ext.set_gap_inner(value);
                    ext.set_gap_outer(value);
                    ext.settings.set_gap_inner(value);
                    ext.settings.set_gap_outer(value);
                }
            )
        )
    }
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
    entry.set_x_align(Clutter.ActorAlign.FILL);
    entry.set_x_expand(true);
    entry.connect('button-release-event', () => {
        return true;
    });

    let text = entry.clutter_text;
    text.set_max_length(3);

    entry.connect('key-press-event', () => {
        Log.debug(`activated`);
    });

    entry.connect('key-release-event', (_: any, event: any) => {
        const symbol = event.get_key_symbol();

        Log.debug(`event symbol: ${symbol}`)

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

            callback(number);
        }
    });

    text.connect('text-changed', () => {
        const input: string = text.get_text();
        const last = input.slice(-1);
        const parsed = parseInt(last);

        if (isNaN(parsed)) {
            text.set_text(input.substr(0, input.length - 1));
        }
    });

    let item = new PopupMenuItem(label);
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
                        Log.debug(`attached Window(${window}) to Fork(${entity})`);
                        tiler.attached.insert(window, entity);
                    }),
                ext.register_storage()
            );

            ext.auto_tiler = tiler;

            ext.settings.set_tile_by_default(true);

            for (const window of ext.windows.values()) {
                if (window.is_tilable(ext)) tiler.auto_tile(ext, window, false);
            }

            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                ext.switch_to_workspace(original);
                return false;
            });
        }
    });
}
