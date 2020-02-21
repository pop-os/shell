const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, Gio, GObject, St } = imports.gi;
const { PopupMenu, PopupMenuItem, PopupSeparatorMenuItem, PopupSwitchMenuItem } = imports.ui.popupMenu;
const { Button } = imports.ui.panelMenu;

const Lib = Me.imports.lib;
const { log } = Lib;

var Indicator = GObject.registerClass(
    class Indicator extends Button {
        _init(ext) {
            super._init(0.0, _("Pop Shell Settings"));

            this.icon = new St.Icon({
                icon_name: "focus-windows-symbolic",
                style_class: "system-status-icon"
            });

            this.add_actor(this.icon);

            this.menu.addMenuItem(new PopupSeparatorMenuItem());

            this.menu.addMenuItem(number_entry(ext, _("Inner Gap"), ext.set_gap_inner, ext.settings.set_gap_inner, () => ext.gap_inner, (prev, current) => {
                if (current - prev != 0) {
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
