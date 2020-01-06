const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, Gdk, Meta, Shell, St } = imports.gi;
const { Geom } = Me.imports.lib;
const Main = imports.ui.main;

function focus(windows) {
    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let sorted = windows(focused, global.display.get_tab_list(Meta.TabList.NORMAL, workspace))
    if (sorted.length > 0) {
        let win = sorted[0];
        win.activate(global.get_current_time());

        let rect = win.get_frame_rect();
        let x = Geom.xcenter(rect);
        let y = Geom.ycenter(rect);

        let display = Gdk.DisplayManager.get().get_default_display();

        display.get_default_seat()
            .get_pointer()
            .warp(display.get_default_screen(), x, y);
    }
}

function left() {
    focus(function (focused, windows) {
        return windows
            .filter((win) => win.get_frame_rect().x < focused.get_frame_rect().x)
            .sort((a, b) => Geom.leftward_distance(a, focused) - Geom.leftward_distance(b, focused));
    });
}

function down() {
    focus(function (focused, windows) {
        return windows
            .filter((win) => win.get_frame_rect().y > focused.get_frame_rect().y)
            .sort((a, b) => Geom.downward_distance(a, focused) - Geom.downward_distance(b, focused));
    });
}

function up() {
    focus(function (focused, windows) {
        return windows
            .filter((win) => win.get_frame_rect().y < focused.get_frame_rect().y)
            .sort((a, b) => Geom.upward_distance(a, focused) - Geom.upward_distance(b, focused));
    });
}

function right() {
    focus(function (focused, windows) {
        return windows
            .filter((win) => win.get_frame_rect().x > focused.get_frame_rect().x)
            .sort((a, b) => Geom.rightward_distance(a, focused) - Geom.rightward_distance(b, focused));
    });
}

function monitor_left() {
    focus(function (focused, windows) {
        return windows
            .filter((win) => win.get_monitor() != Main.layoutManager.focusIndex)
            .filter((win) => win.get_frame_rect().x < focused.get_frame_rect().x)
            .sort((a, b) => Geom.window_distance(a, focused) - Geom.window_distance(b, focused));
    });
}

function monitor_right() {
    focus(function (focused, windows) {
        return windows
            .filter((win) => win.get_monitor() != Main.layoutManager.focusIndex)
            .filter((win) => win.get_frame_rect().x > focused.get_frame_rect().x)
            .sort((a, b) => Geom.window_distance(a, focused) - Geom.window_distance(b, focused));
    });
}
