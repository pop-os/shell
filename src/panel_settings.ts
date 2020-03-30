const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as auto_tiler from 'auto_tiler';
import * as Log from 'log';

import type { Entity } from './ecs';
import type { Ext } from './extension';

const { Clutter, Gio, St } = imports.gi;
const { PopupSwitchMenuItem, PopupSubMenuMenuItem } = imports.ui.popupMenu;
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
    }
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