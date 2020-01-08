const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, Gdk, Meta, Shell, St } = imports.gi;
const { Geom, Window } = Me.imports.lib;
const Main = imports.ui.main;

function focus(windows, func, focused = null) {
    if (!focused) focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let sorted = windows(focused, global.display.get_tab_list(Meta.TabList.NORMAL, workspace))
    if (sorted.length > 0) func(sorted[0]);
}

// Focus shifting

function down() {
    focus(window_down, Window.activate);
}

function left() {
    focus(window_left, Window.activate);
}

function right() {
    focus(window_right, Window.activate);
}

function up() {
    focus(window_up, Window.activate);
}

function monitor_left() {
    focus(window_monitor_left, Window.activate);
}

function monitor_right() {
    focus(window_monitor_right, Window.activate);
}

// Window swapping

function swap(func) {
    var focused = global.display.focus_window;
    focus(func, (win) => Window.swap(focused, win), focused)
}

function swap_above() {
    swap(window_up)
}

function swap_below() {
    var focused = global.display.focus_window;
    focus(window_down, (win) => Window.swap(focused, win), focused)
}

function swap_left() {
    var focused = global.display.focus_window;
    focus(window_left, (win) => Window.swap(focused, win), focused)
}

function swap_right() {
    var focused = global.display.focus_window;
    focus(window_right, (win) => Window.swap(focused, win), focused)
}

// Selecting the next window

function window_down(focused, windows) {
    return windows
        .filter((win) => win.get_frame_rect().y > focused.get_frame_rect().y)
        .sort((a, b) => Geom.downward_distance(a, focused) - Geom.downward_distance(b, focused));
}

function window_left(focused, windows) {
    return windows
        .filter((win) => win.get_frame_rect().x < focused.get_frame_rect().x)
        .sort((a, b) => Geom.leftward_distance(a, focused) - Geom.leftward_distance(b, focused));
}

function window_monitor_left(focused, windows) {
    return windows
        .filter((win) => win.get_monitor() != Main.layoutManager.focusIndex)
        .filter((win) => win.get_frame_rect().x < focused.get_frame_rect().x)
        .sort((a, b) => Geom.window_distance(a, focused) - Geom.window_distance(b, focused));
}

function window_monitor_right(focused, windows) {
    return windows
        .filter((win) => win.get_monitor() != Main.layoutManager.focusIndex)
        .filter((win) => win.get_frame_rect().x > focused.get_frame_rect().x)
        .sort((a, b) => Geom.window_distance(a, focused) - Geom.window_distance(b, focused));
}

function window_right(focused, windows) {
    return windows
        .filter((win) => win.get_frame_rect().x > focused.get_frame_rect().x)
        .sort((a, b) => Geom.rightward_distance(a, focused) - Geom.rightward_distance(b, focused));
}

function window_up(focused, windows) {
    return windows
        .filter((win) => win.get_frame_rect().y < focused.get_frame_rect().y)
        .sort((a, b) => Geom.upward_distance(a, focused) - Geom.upward_distance(b, focused));
}
