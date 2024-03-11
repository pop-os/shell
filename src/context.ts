import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export function addMenu(widget: any, request: (menu: St.Widget) => void): St.Widget {
    const menu = new PopupMenu.PopupMenu(widget, 0.0, St.Side.TOP, 0);
    Main.uiGroup.add_child(menu.actor);
    menu.actor.hide();
    menu.actor.add_style_class_name('panel-menu');

    // Intercept right click events on the launcher app's button
    widget.connect('button-press-event', (_: any, event: any) => {
        if (event.get_button() === 3) {
            request(menu);
        }
    });

    return menu;
}

export function addContext(menu: St.Widget, name: string, activate: () => void) {
    const menu_item = appendMenuItem(menu, name);

    menu_item.connect('activate', () => activate());
}

function appendMenuItem(menu: any, label: string) {
    let item = new PopupMenu.PopupMenuItem(label);
    menu.addMenuItem(item);
    return item;
}
