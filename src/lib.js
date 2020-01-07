const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const { Gdk } = imports.gi;
const Shell = imports.gi.Shell;
const Settings = Me.imports.settings;

var Geom = Me.imports.geom;
var Keybindings = Me.imports.keybindings;

/// Activates a window, and moves the mouse point to the center of it.
function activate_window(win) {
    win.unminimize();
    win.activate(global.get_current_time());

    let rect = win.get_frame_rect();
    let x = Geom.xcenter(rect);
    let y = Geom.ycenter(rect);

    let display = Gdk.DisplayManager.get().get_default_display();

    display.get_default_seat()
        .get_pointer()
        .warp(display.get_default_screen(), x, y);
}

function log(text) {
    global.log("pop-shell: " + text);
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}
