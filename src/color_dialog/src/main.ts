#!/usr/bin/gjs --module

import data from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk';

const EXT_PATH_DEFAULTS = [
    GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/',
    '/usr/share/gnome-shell/extensions/',
];
const DEFAULT_HINT_COLOR = 'rgba(251, 184, 108, 1)'; //pop-orange

/** Look for the extension in path */
function getExtensionPath(uuid: string) {
    let ext_path = null;

    for (let i = 0; i < EXT_PATH_DEFAULTS.length; i++) {
        let path = EXT_PATH_DEFAULTS[i];
        let file = data.File.new_for_path(path + uuid);
        log(file.get_path());
        if (file.query_exists(null)) {
            ext_path = file;
            break;
        }
    }

    return ext_path;
}

function getSettings(schema: string) {
    let extensionPath = getExtensionPath('pop-shell@system76.com');
    if (!extensionPath) throw new Error('getSettings() can only be called when extension is available');

    // The following will load a custom path for a user defined gsettings/schemas folder
    const GioSSS = data.SettingsSchemaSource;
    const schemaDir = extensionPath.get_child('schemas');

    let schemaSource = schemaDir.query_exists(null)
        ? GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false)
        : GioSSS.get_default();

    const schemaObj = schemaSource.lookup(schema, true);

    if (!schemaObj) {
        throw new Error('Schema ' + schema + ' could not be found for extension ');
    }
    return new data.Settings({ settings_schema: schemaObj });
}
/**
 * Launch a Gtk.ColorChooserDialog. And then save the color RGBA/alpha values in GSettings of Pop-Shell.
 * Using the settings.connect('changed') mechanism, the extension is able to listen to when the color changes in realtime.
 */
function launch_color_dialog() {
    let popshell_settings = getSettings('org.gnome.shell.extensions.pop-shell');

    let color_dialog = new Gtk.ColorChooserDialog({
        title: 'Choose Color',
    });
    color_dialog.show_editor = true;
    color_dialog.show_all();

    // Use the new spec format for Gtk.Color thru Gdk.RGBA
    let rgba = new Gdk.RGBA();
    if (rgba.parse(popshell_settings.get_string('hint-color-rgba'))) {
        color_dialog.set_rgba(rgba);
    } else {
        rgba.parse(DEFAULT_HINT_COLOR);
        color_dialog.set_rgba(rgba);
    }

    let response = color_dialog.run();

    if (response === Gtk.ResponseType.CANCEL) {
        color_dialog.destroy();
    } else if (response === Gtk.ResponseType.OK) {
        // save the selected RGBA to GSettings
        // TODO, save alpha instead of always 1.0
        popshell_settings.set_string('hint-color-rgba', color_dialog.get_rgba().to_string());
        data.Settings.sync();
        color_dialog.destroy();
    }
}

Gtk.init(null);

launch_color_dialog();
