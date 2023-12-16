const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Utils from 'utils';

import type { Ext } from './extension';

const { Clutter, Gio, St } = imports.gi;
const { PopupBaseMenuItem, PopupMenuItem, PopupSwitchMenuItem, PopupSeparatorMenuItem } = imports.ui.popupMenu;
const { Button } = imports.ui.panelMenu;
const GLib: GLib = imports.gi.GLib;

export class Indicator {
    button: any;
    appearances: any;

    toggle_tiled : any
    toggle_titles: null | any
    toggle_active: any
    border_radius: any
    border_width: any

    entry_gaps: any

    constructor(ext: Ext) {
        this.button = new Button(0.0, _("Pop Shell Settings"));

        ext.button = this.button;
        ext.button_gio_icon_auto_on = Gio.icon_new_for_string(`${Me.path}/icons/pop-shell-auto-on-symbolic.svg`);
        ext.button_gio_icon_auto_off = Gio.icon_new_for_string(`${Me.path}/icons/pop-shell-auto-off-symbolic.svg`);

        let button_icon_auto_on = new St.Icon({
            gicon: ext.button_gio_icon_auto_on,
            style_class: "system-status-icon",
        });
        let button_icon_auto_off = new St.Icon({
            gicon: ext.button_gio_icon_auto_off,
            style_class: "system-status-icon",
        });

        if (ext.settings.tile_by_default()) {
            this.button.icon = button_icon_auto_on;
        } else {
            this.button.icon = button_icon_auto_off;
        }

        this.button.add_actor(this.button.icon);

        let bm = this.button.menu;

        this.toggle_tiled = tiled(ext)

        this.toggle_active = toggle(
            _("Show Active Hint"),
            ext.settings.active_hint(),
            (toggle) => {
                ext.settings.set_active_hint(toggle.state);
            }
        )

        this.entry_gaps = number_entry(
            _("Gaps"),
            ext.settings.gap_inner(),
            (value) => {
                ext.settings.set_gap_inner(value);
                ext.settings.set_gap_outer(value);
            }
        )

        this.border_radius = number_entry(
            _("Active Border Radius"),
            {
              value: ext.settings.active_hint_border_radius(),
              min: 0,
              max: 30
            },
            (value) => {
                ext.settings.set_active_hint_border_radius(value);
            }
        )

        this.border_width = number_entry(
            _("Active Border Width"),
            {
              value: ext.settings.active_hint_border_width(),
              min: 1,
              max: 15
            },
            (value) => {
                ext.settings.set_active_hint_border_width(value);
            }
        )

        bm.addMenuItem(this.toggle_tiled);
        bm.addMenuItem(floating_window_exceptions(ext, bm));

        bm.addMenuItem(menu_separator(''));
        bm.addMenuItem(shortcuts(bm));
        bm.addMenuItem(settings_button(bm));
        bm.addMenuItem(menu_separator(''));

        if (!Utils.is_wayland()) {
            this.toggle_titles = show_title(ext)
            bm.addMenuItem(this.toggle_titles);
        }

        bm.addMenuItem(this.toggle_active);
        bm.addMenuItem(this.border_radius);
        bm.addMenuItem(this.border_width);

        // CSS Selector
        bm.addMenuItem(color_selector(ext, bm),);

        bm.addMenuItem(this.entry_gaps)
    }

    destroy() {
        this.button.destroy();
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
            imports.misc.util.spawn(['xdg-open', 'https://support.system76.com/articles/pop-keyboard-shortcuts/']);
        }

        menu.close();
    })

    item.label.get_clutter_text().set_margin_left(12);

    return item;
}

function floating_window_exceptions(ext: Ext, menu: any): any {
    let label = new St.Label({ text: "Floating Window Exceptions" })
    label.set_x_expand(true)

    let icon = new St.Icon({ icon_name: "go-next-symbolic", icon_size: 16 })

    let widget = new St.BoxLayout({ vertical: false })
    widget.add(label);
    widget.add(icon);
    widget.set_x_expand(true)

    let base = new PopupBaseMenuItem();
    base.add_child(widget);
    base.connect('activate', () => {
        ext.exception_dialog();

        GLib.timeout_add(GLib.PRIORITY_LOW, 300, () => {
            menu.close();
            return false;
        });
    });

    return base;
}

function shortcuts(menu: any): any {
    let layout_manager = new Clutter.GridLayout({ orientation: Clutter.Orientation.HORIZONTAL });
    let widget = new St.Widget({ layout_manager, x_expand: true });

    let item = new PopupBaseMenuItem();
    item.add_child(widget);
    item.connect('activate', () => {
        let path: string | null = GLib.find_program_in_path('pop-shell-shortcuts');
        if (path) {
            imports.misc.util.spawn([path]);
        } else {
            imports.misc.util.spawn(['xdg-open', 'https://support.system76.com/articles/pop-keyboard-shortcuts/']);
        }

        menu.close();
    })

    function create_label(text: string): any {
        return new St.Label({ text });
    }

    function create_shortcut_label(text: string): any {
        let label = create_label(text);
        label.set_x_align(Clutter.ActorAlign.END);
        return label;
    }

    layout_manager.set_row_spacing(12);
    layout_manager.set_column_spacing(30);
    layout_manager.attach(create_label(_('Shortcuts')), 0, 0, 2, 1);

    let launcher_shortcut = _("Super + /")
    const cosmic_settings = Me.imports.settings.settings_new_id('org.gnome.shell.extensions.pop-cosmic')
    if (cosmic_settings) {
        if (cosmic_settings.get_enum('overlay-key-action') === 2) {
            launcher_shortcut = _("Super")
        }
    }

    [
        [_('Launcher'), launcher_shortcut],
        [_('Navigate Windows'), _('Super + Arrow Keys')],
        [_('Toggle Tiling'), _('Super + Y')],
    ].forEach((section, idx) => {
        let key = create_label(section[0]);
        key.get_clutter_text().set_margin_left(12);

        let val = create_shortcut_label(section[1]);

        layout_manager.attach(key, 0, idx + 1, 1, 1);
        layout_manager.attach(val, 1, idx + 1, 1, 1);
    });

    return item;
}

function clamp(input: number, min = 0, max = 128): number {
    return Math.min(Math.max(min, input), max);
}

function number_entry(
    label: string,
    valueOrOptions: number|{value: number, min: number, max: number},
    callback: (a: number) => void,
): any {
    let value = valueOrOptions, min: number, max: number;
    if (typeof valueOrOptions !== 'number')
      ({ value, min, max } = valueOrOptions);

    const entry = new St.Entry({
        text: String(value),
        input_purpose: Clutter.InputContentPurpose.NUMBER,
        x_align: Clutter.ActorAlign.CENTER,
        x_expand: false
    });

    entry.set_style('width: 5em')
    entry.connect('button-release-event', () => {
        return true;
    });

    const text = entry.clutter_text;
    text.set_max_length(2);

    entry.connect('key-release-event', (_: any, event: any) => {
        const symbol = event.get_key_symbol();

        const number: number | null =
            symbol == 65293     // enter key
                ? parse_number(text.text)
                : symbol == 65361   // left key
                    ? clamp(parse_number(text.text) - 1, min, max)
                    : symbol == 65363   // right key
                        ? clamp(parse_number(text.text) + 1, min, max)
                        : null;

        if (number !== null) {
            text.set_text(String(number));
        }
    });

    const create_icon = (icon_name: string) => {
        return new St.Icon({ icon_name, icon_size: 16 })
    }

    entry.set_primary_icon(create_icon('value-decrease'))
    entry.connect('primary-icon-clicked', () => {
        text.set_text(String(clamp(parseInt(text.get_text()) - 1, min, max)))
    })

    entry.set_secondary_icon(create_icon('value-increase'))
    entry.connect('secondary-icon-clicked', () => {
        text.set_text(String(clamp(parseInt(text.get_text()) + 1, min, max)))
    })

    text.connect('text-changed', () => {
        const input: string = text.get_text();
        let parsed = parseInt(input);

        if (isNaN(parsed)) {
            text.set_text(input.substr(0, input.length - 1));
            parsed = 0;
        }

        callback(parsed);
    });

    const item = new PopupMenuItem(label);
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

function show_title(ext: Ext): any {
    const t = toggle(_("Show Window Titles"), ext.settings.show_title(), (toggle: any) => {
        ext.settings.set_show_title(toggle.state);
    });

    return t;
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
    let t = toggle(_("Tile Windows"), null != ext.auto_tiler, () => ext.toggle_tiling());
    return t;
}

// @ts-ignore
function color_selector(ext: Ext, menu: any) {
    let color_selector_item = new PopupMenuItem('Active Hint Color');
    let color_button = new St.Button();
    let settings = ext.settings;
    let selected_color = settings.hint_color_rgba();

    // TODO, find a way to expand the button text, :)
    color_button.label = "           "; // blank for now
    color_button.set_style(`background-color: ${selected_color}; border: 2px solid lightgray; border-radius: 2px`);

    settings.ext.connect('changed', (_, key) => {
        if (key === 'hint-color-rgba') {
            let color_value = settings.hint_color_rgba();
            color_button.set_style(`background-color: ${color_value}; border: 2px solid lightgray; border-radius: 2px`);
        }
    });

    color_button.set_x_align(Clutter.ActorAlign.END);
    color_button.set_x_expand(false);

    color_selector_item.label.get_clutter_text().set_x_expand(true);
    color_selector_item.label.set_y_align(Clutter.ActorAlign.CENTER);

    color_selector_item.add_child(color_button);
    color_button.connect('button-press-event', () => {
        let path = Me.dir.get_path() + "/color_dialog/main.js";
        let resp = GLib.spawn_command_line_async(`gjs ${path}`);
        if (!resp) {

            return null;
        }

        // clean up and focus on the color dialog
        GLib.timeout_add(GLib.PRIORITY_LOW, 300, () => {
            menu.close();
            return false;
        });

    });

    return color_selector_item;
}
