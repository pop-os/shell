#!/usr/bin/gjs

imports.gi.versions.Gtk = '3.0';

const { Gio, GLib, Gtk, Gdk } = imports.gi;

const EXT_PATH_DEFAULTS = [
    GLib.get_home_dir() + "/.local/share/gnome-shell/extensions/",
    "/usr/share/gnome-shell/extensions/"
];

/** Look for the extension in path */
function getExtensionPath(uuid) {
    let ext_path = null;

    for (let i = 0; i < EXT_PATH_DEFAULTS.length; i++) {
        let path = EXT_PATH_DEFAULTS[0];
        let file = Gio.File.new_for_path(path + uuid);
        if (file != null) {
            ext_path = file;
            break;
        }
    };

    return ext_path;
}

function getSettings(schema) {
    let extensionPath = getExtensionPath("pop-shell@system76.com");

    if (!extensionPath)
        throw new Error('getSettings() can only be called when extension is available');

    // For some reason, this does not seem to be recognized by GJS as a valid schemaDir
    // let schemaDir = extensionPath.get_child('schemas');
    // return Gio.Settings.new_with_path(schema, schemaDir.get_path() + "/");
    // However, `gsettings --schemaDir /home/path/to/extension/schemas/ list-keys uuid` command works. Really confused.

    // Had to install the gschema.xml into /usr/share/glib2.0/schemas and recompile.

    // use this one for now, it uses the installed schema in `/usr/share/glib2.0/schemas`
    return new Gio.Settings({ schema_id: schema });
}
/**
 * Launch a Gtk.ColorChooserDialog. And then save the color RGBA/alpha values in GSettings of Pop-Shell.
 * Using the settings.connect('changed') mechanism, the extension is able to listen to when the color changes in realtime.
 */
function launch_color_dialog() {
    let popshell_settings = getSettings("org.gnome.shell.extensions.pop-shell");

    let color_dialog = new Gtk.ColorChooserDialog({
        title: "Choose Color"
    });
    color_dialog.connect("destroy", Gtk.main_quit);
    color_dialog.show_editor = true;
    color_dialog.show_all();

    // Use the new spec format for Gtk.Color thru Gdk.RGBA
    let rgba = new Gdk.RGBA();
    if (rgba.parse(popshell_settings.get_string("hint-color-rgba"))) {
        color_dialog.set_rgba(rgba);
    }

    let response = color_dialog.run();

    if (response === Gtk.ResponseType.CANCEL) {
        color_dialog.destroy();
    } else if (response === Gtk.ResponseType.OK) {
        // save the selected RGBA to GSettings
        // TODO, save alpha instead of always 1.0
        let applied = popshell_settings.set_string("hint-color-rgba", color_dialog.get_rgba().to_string());
        Gio.Settings.sync();
        color_dialog.destroy();
    }

    return color_dialog;
}

Gtk.init(null);

let dialog = launch_color_dialog();
dialog.activate_focus();

Gtk.main();