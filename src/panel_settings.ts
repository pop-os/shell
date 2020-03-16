const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as active_hint from 'active_hint';
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
        this.button.menu.addMenuItem(snap_to_grid(ext));

        this.appearances = new PopupSubMenuMenuItem('Appearance', true);
        this.appearances.icon.icon_name = 'preferences-desktop-display-symbolic';
        this.button.menu.addMenuItem(this.appearances);

        this.appearances.menu.addMenuItem(toggle(_("Show Active Hint"), ext.settings.active_hint(), (toggle) => {
            ext.settings.set_active_hint(toggle.state);
            if (toggle.state) {
                ext.active_hint = new active_hint.ActiveHint(ext.dpi);

                const focused = ext.focus_window();
                if (focused) {
                    ext.active_hint.track(focused);
                }
            } else if (ext.active_hint) {
                ext.active_hint.destroy();
                ext.active_hint = null;
            }
        }));

        this.appearances.menu.addMenuItem(title_bars(ext));

        this.appearances.menu.addMenuItem(
            number_entry(ext,
                _("Inner Gap"),
                ext.set_gap_inner,
                ext.settings.set_gap_inner,
                () => ext.gap_inner / 4,
                (prev: number, current: number) => {
                    if (current != prev) {
                        Log.info(`inner gap changed to ${current}`);
                        if (ext.auto_tiler) {
                            ext.switch_workspace_on_move = false;
                            for (const [entity,] of ext.auto_tiler.forest.toplevel.values()) {
                                const fork = ext.auto_tiler.forest.forks.get(entity);
                                if (fork) {
                                    ext.auto_tiler.tile(ext, fork, fork.area);
                                }
                            }
                            ext.switch_workspace_on_move = true;
                        } else {
                            ext.update_snapped();
                        }

                        Gio.Settings.sync();
                    }
                }
            )
        );

        this.appearances.menu.addMenuItem(
            number_entry(ext,
                _("Outer Gap"),
                ext.set_gap_outer,
                ext.settings.set_gap_outer,
                () => ext.gap_outer / 4,
                (prev: number, current: number) => {
                    Log.info(`${current} != ${prev}`);
                    const diff = current - prev;
                    if (diff != 0) {
                        Log.info(`outer gap changed to ${current}`);
                        if (ext.auto_tiler) {
                            ext.switch_workspace_on_move = false;
                            for (const [entity,] of ext.auto_tiler.forest.toplevel.values()) {
                                const fork = ext.auto_tiler.forest.forks.get(entity);

                                if (fork) {
                                    fork.area.array[0] += diff * 4;
                                    fork.area.array[1] += diff * 4;
                                    fork.area.array[2] -= diff * 8;
                                    fork.area.array[3] -= diff * 8;

                                    ext.auto_tiler.tile(ext, fork, fork.area);
                                }
                            }
                            ext.switch_workspace_on_move = true;
                        } else {
                            ext.update_snapped();
                        }

                        Gio.Settings.sync();
                    }
                }
            )
        );
    }
}

function clamp(input: number): number {
    return Math.min(Math.max(0, input), 128);
}

function number_entry(
    ext: Ext,
    label: string,
    ext_method: any,
    settings_method: any,
    get_method: any,
    post_exec: (a: number, b: number) => void
): any {
    let entry = new St.Entry({ text: String(get_method.call(ext)) });
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

            const prev = get_method.call(ext);
            Log.debug(`prev(${prev}), current: ${number}`);
            settings_method.call(ext.settings, number);
            ext_method.call(ext, number);

            post_exec(prev, number);
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

function snap_to_grid(ext: Ext): any {
    return toggle(_("Snap to Grid"), ext.settings.snap_to_grid(), (toggle) => {
        ext.settings.set_snap_to_grid(toggle.state);
    });
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

function title_bars(ext: Ext) {
    return toggle(_("Show Window Titles"), ext.settings.show_title(), (toggle) => {
        ext.settings.set_show_title(toggle.state);
        for (const window of ext.windows.values()) {
            if (window.meta.is_client_decorated()) continue;

            if (toggle.state) {
                window.decoration_show(ext);
            } else {
                window.decoration_hide(ext);
            }
        }
    });
}
