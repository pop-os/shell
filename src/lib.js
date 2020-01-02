const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

function log(text) {
    global.log("pop-shell: " + text);
}

function settings() {
    const extension = ExtensionUtils.getCurrentExtension();
    const schema = extension.metadata["settings-schema"];
    const GioSSS = Gio.SettingsSchemaSource;
    const schemaDir = extension.dir.get_child("schemas");
    let schemaSource = schemaDir.query_exists(null) ?
        GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false) :
        GioSSS.get_default();

    const schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error("Schema " + schema + " could not be found for extension "
            + extension.metadata.uuid + ". Please check your installation.");
    let settings = new Gio.Settings({ settings_schema: schemaObj });
    return settings;
}

function enable_keybindings(keybindings) {
    log("enable_keybindings");
    for (var name in keybindings) {
        Main.wm.addKeybinding(
            name,
            settings(),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            keybindings[name]
        );
    }
}

function disable_keybindings(keybindings) {
    log("disable_keybindings");
    for (var name in keybindings) {
        Main.wm.removeKeybinding(name);
    }
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}
