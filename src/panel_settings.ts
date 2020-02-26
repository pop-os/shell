const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, Gio, GObject, St } = imports.gi;
const { PopupMenuItem, PopupSeparatorMenuItem, PopupSwitchMenuItem } = imports.ui.popupMenu;
const { Button } = imports.ui.panelMenu;

import * as Lib from 'lib';
import * as Log from 'log';

import type { Entity } from './ecs';
import type { Ext } from './extension';

const { AutoTiler } = Me.imports.auto_tiler;

export var Indicator = GObject.registerClass(
    class Indicator extends Button {
        _init(ext: Ext) {
            super._init(0.0, _("Pop Shell Settings"));

            this.icon = new St.Icon({
                icon_name: "focus-windows-symbolic",
                style_class: "system-status-icon"
            });

            this.add_actor(this.icon);

            this.menu.addMenuItem(tiled(ext));
            this.menu.addMenuItem(title_bars(ext));
            this.menu.addMenuItem(snap_to_grid(ext));
            this.menu.addMenuItem(new PopupSeparatorMenuItem());

            this.menu.addMenuItem(
                number_entry(ext,
                    _("Inner Gap"),
                    ext.set_gap_inner,
                    ext.settings.set_gap_inner,
                    () => ext.gap_inner,
                    (prev: number, current: number) => {
                        if (current - prev != 0) {
                            Log.info(`inner gap changed to ${current}`);
                            if (ext.auto_tiler) {
                                for (const [entity, _] of ext.auto_tiler.toplevel.values()) {
                                    const fork = ext.auto_tiler.forks.get(entity);
                                    if (fork && fork.area) {
                                        ext.tile(fork, fork.area, fork.workspace);
                                    }
                                }
                            } else {
                                ext.update_snapped();
                            }

                            Gio.Settings.sync();
                        }
                    }
                )
            );

            this.menu.addMenuItem(
                number_entry(ext,
                    _("Outer Gap"),
                    ext.set_gap_outer,
                    ext.settings.set_gap_outer,
                    () => ext.gap_outer,
                    (prev: number, current: number) => {
                        const diff = current - prev;
                        if (diff != 0) {
                            Log.info(`outer gap changed to ${current}`);
                            if (ext.auto_tiler) {
                                for (const [entity, _] of ext.auto_tiler.toplevel.values()) {
                                    const fork = ext.auto_tiler.forks.get(entity);

                                    if (fork && fork.area) {
                                        fork.area.array[0] += diff;
                                        fork.area.array[1] += diff;
                                        fork.area.array[2] -= diff * 2;
                                        fork.area.array[3] -= diff * 2;

                                        ext.tile(fork, fork.area, fork.workspace);
                                    }
                                }
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
)

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

    entry.connect('key-release-event', (_: any, event: any) => {
        if (36 == event.get_key_code()) {
            const number = parseInt(text.text, 10);
            if (number) {
                let prev = get_method.call(ext);
                ext_method.call(ext, number);
                settings_method.call(ext.settings, number);
                post_exec(prev, number);
            } else {
                text.text = "";
            }
        }
    });

    let item = new PopupMenuItem(label);
    item.label.set_y_align(Clutter.ActorAlign.CENTER);
    item.add_child(entry);

    return item;
}

function toggle(ext: Ext, desc: string, active: boolean, connect: (toggle: any) => void): any {
    let toggle = new PopupSwitchMenuItem(desc);
    toggle.label.set_y_align(Clutter.ActorAlign.CENTER);

    toggle.setToggleState(active);

    toggle.connect('toggled', () => {
        connect(toggle);

        return true;
    });

    return toggle;
}

function snap_to_grid(ext: Ext): any {
    return toggle(ext, _("Snap to Grid"), ext.settings.snap_to_grid(), (toggle) => {
        ext.settings.set_snap_to_grid(toggle.state);
    });
}

function tiled(ext: Ext): any {
    return toggle(ext, _("Launch Windows Tiled"), null != ext.auto_tiler, (toggle) => {
        if (ext.attached && ext.auto_tiler) {
            Log.info(`tile by default disabled`);
            ext.mode = Lib.MODE_DEFAULT;
            ext.auto_tiler = null;
            ext.unregister_storage(ext.attached);
            ext.settings.set_tile_by_default(false);
        } else {
            Log.info(`tile by default enabled`);
            ext.mode = Lib.MODE_AUTO_TILE;
            ext.attached = ext.register_storage();
            ext.settings.set_tile_by_default(true);
            ext.auto_tiler = new AutoTiler()
                .connect_on_attach((entity: Entity, window: Entity) => {
                    if (ext.attached) {
                        Log.debug(`attached Window(${window}) to Fork(${entity})`);
                        ext.attached.insert(window, entity);
                    }
                });

            for (const window of ext.windows.values()) {
                if (window.is_tilable()) ext.auto_tile(window, false);
            }
        }
    });
}

function title_bars(ext: Ext) {
    return toggle(ext, _("Show Window Titles"), ext.settings.show_title(), (toggle) => {
        ext.settings.set_show_title(toggle.state);
        for (const window of ext.windows.values()) {
            if (window.meta.is_client_decorated()) continue;

            if (toggle.state) {
                window.decoration_show();
            } else {
                window.decoration_hide();
            }
        }
    });
}
