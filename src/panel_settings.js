const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, GObject, St } = imports.gi;
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

            this.menu.addMenuItem(gaps(ext));
        }
    }
)

function gaps(ext, current) {
    let entry = new St.Entry(current);
    entry.set
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
                ext.settings.set_gap(number);
                ext.tiler.set_gap(number);
                if (ext.auto_tiler) {
                    for (const [entity, _] of ext.auto_tiler.toplevel.values()) {
                        const fork = ext.auto_tiler.forks.get(entity);
                        fork.tile(ext.auto_tiler, ext, fork.area, fork.workspace);
                    }
                } else {
                    ext.update_snapped();
                }
            } else {
                text.text = "";
            }
        }

        return true;
    });

    let gaps = new PopupMenuItem(_("Inner Gap"));
    gaps.label.set_y_align(Clutter.ActorAlign.CENTER);
    gaps.add_child(entry);

    return gaps;
}
