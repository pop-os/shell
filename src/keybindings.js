const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Meta, Shell } = imports.gi;
const { log } = Me.imports.lib;
const { wm } = imports.ui.main;
const { Settings } = Me.imports.settings;

var settings = new Settings();

function enable(keybindings) {
    for (var name in keybindings) {
        wm.addKeybinding(
            name,
            settings.inner,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            keybindings[name]
        );
    }
}

function disable(keybindings) {
    for (var name in keybindings) {
        wm.removeKeybinding(name);
    }
}
