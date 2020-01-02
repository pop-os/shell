const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Settings = Me.imports.settings;

var settings = new Settings.Settings();

function log(text) {
    global.log("pop-shell: " + text);
}

function enable_keybindings(keybindings) {
    log("enable_keybindings");
    for (var name in keybindings) {
        Main.wm.addKeybinding(
            name,
            settings.inner,
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
