const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, Gio, GObject, St } = imports.gi;
const { PopupMenu, PopupMenuItem, PopupSeparatorMenuItem, PopupSwitchMenuItem } = imports.ui.popupMenu;
const { Button } = imports.ui.panelMenu;

const Lib = Me.imports.lib;
const Log = Me.imports.log;

const { AutoTiler } = Me.imports.auto_tiler;

var Indicator = GObject.registerClass(
    class Indicator extends Button {
        _init(ext) {
            super._init(0.0, _("Pop Shell Settings"));

            this.icon = new St.Icon({
                icon_name: "focus-windows-symbolic",
                style_class: "system-status-icon"
            });

            this.add_actor(this.icon);

            this.menu.addMenuItem(tiled(ext));
            this.menu.addMenuItem(new PopupSeparatorMenuItem());

            this.menu.addMenuItem(number_entry(ext, _("Inner Gap"), ext.set_gap_inner, ext.settings.set_gap_inner, () => ext.gap_inner, (prev, current) => {
                if (current - prev != 0) {
                    Log.info(`inner gap changed to ${current}`);
                    if (ext.auto_tiler) {
                        for (const [entity, _] of ext.auto_tiler.toplevel.values()) {
                            const fork = ext.auto_tiler.forks.get(entity);
                            ext.tile(fork, fork.area, fork.workspace);
                        }
                    } else {
                        ext.update_snapped();
                    }

                    Gio.Settings.sync();
                }
            }));

            this.menu.addMenuItem(number_entry(ext, _("Outer Gap"), ext.set_gap_outer, ext.settings.set_gap_outer, () => ext.gap_outer, (prev, current) => {
                const diff = current - prev;
                if (diff != 0) {
                    Log.info(`outer gap changed to ${current}`);
                    if (ext.auto_tiler) {
                        for (const [entity, _] of ext.auto_tiler.toplevel.values()) {
                            const fork = ext.auto_tiler.forks.get(entity);

                            fork.area[0] += diff;
                            fork.area[1] += diff;
                            fork.area[2] -= diff * 2;
                            fork.area[3] -= diff * 2;

                            ext.tile(fork, fork.area, fork.workspace);
                        }
                    } else {
                        ext.update_snapped();
                    }

                    Gio.Settings.sync();
                }
            }));
        }
    }
)

function number_entry(ext, label, ext_method, settings_method, get_method, post_exec) {
    let entry = new St.Entry({ text: String(get_method.call(ext)) });
    entry.set_input_purpose(Clutter.InputContentPurpose.NUMBER);
    entry.set_x_align(Clutter.ActorAlign.FILL);
    entry.set_x_expand(true);
    entry.connect('button-release-event', (_, event) => {
        return true;
    });

    let text = entry.clutter_text;
    text.set_max_length(3);

    entry.connect('key-release-event', (_, event) => {
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

function tiled(ext) {
    let tiled = new PopupSwitchMenuItem(_("Launch Windows Tiled"));
    tiled.label.set_y_align(Clutter.ActorAlign.CENTER);

    tiled.setToggleState(null != ext.auto_tiler);

    tiled.connect('toggled', (item) => {
        if (ext.auto_tiler) {
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
                .connect_on_attach((entity, window) => {
                    Log.debug(`attached Window(${window}) to Fork(${entity})`);
                    ext.attached.insert(window, entity);
                });
        }

        return true;
    });

    return tiled;
}
