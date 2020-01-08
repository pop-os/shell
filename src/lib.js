const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;

var Geom = Me.imports.geom;
var Window = Me.imports.window;

function current_monitor() {
    return global.display.get_monitor_geometry(global.display.get_current_monitor());
}

function log(text) {
    global.log("pop-shell: " + text);
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}
