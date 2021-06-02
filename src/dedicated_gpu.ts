import type { AppInfo } from './app_info'

const { Shell, St } = imports.gi;
const AppDisplay = imports.ui.appDisplay;

const PopupMenu = imports.ui.popupMenu
const Main = imports.ui.main

const appSys = Shell.AppSystem.get_default()

export function addPopup(info: AppInfo, widget: any) {
    // GNOME Shell already tracks if a discrete GPU is available.
    // We will only add a popup if one is available.
    if (!AppDisplay.discreteGpuAvailable) return

    const menu = new PopupMenu.PopupMenu(widget, 0.0, St.Side.TOP, 0)
    Main.uiGroup.add_actor(menu.actor)
    menu.actor.hide()
    menu.actor.add_style_class_name('panel-menu');

    const appPrefersNonDefaultGPU = info.app_info.get_boolean('PrefersNonDefaultGPU');
    const gpuPref = appPrefersNonDefaultGPU
        ? Shell.AppLaunchGpu.DEFAULT
        : Shell.AppLaunchGpu.DISCRETE;

    const menu_item = appendMenuItem(menu, appPrefersNonDefaultGPU
        ? _('Launch using Integrated Graphics Card')
        : _('Launch using Discrete Graphics Card'));

    menu_item.connect('activate', () => {
        appSys.lookup_desktop_wmclass(info.id())?.launch(0, -1, gpuPref)
    });

    // Intercept right click events on the launcher app's button
    widget.connect('button-press-event', (_: any, event: any) => {
        if (event.get_button() === 3) {
            menu.toggle()
        }
    })
}

function appendMenuItem(menu: any, label: string) {
    let item = new PopupMenu.PopupMenuItem(label);
    menu.addMenuItem(item);
    return item
}