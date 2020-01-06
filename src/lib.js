const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Settings = Me.imports.settings;

var Keybindings = Me.imports.keybindings;

function log(text) {
    global.log("pop-shell: " + text);
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}
