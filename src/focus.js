const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

function window_distance(win_a, win_b) {
    let a = win_a.get_frame_rect();
    let b = win_b.get_frame_rect();
    return Math.sqrt(
        Math.pow(b.x - a.x, 2) +
        Math.pow(b.y - a.y, 2)
    );
}

function focus(windows) {
    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    windows(focused, global.display.get_tab_list(Meta.TabList.NORMAL, workspace))
        .forEach(function (win, i) {
            log("  " + win.get_title());
            if (i == 0) {
                win.activate(global.get_current_time());
            }
        });
}

function left() {
    log("focus_left");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().x < focused.get_frame_rect().x;
            })
            .sort(function (a, b) {
                return window_distance(a, focused) - window_distance(b, focused);
            });
    });
}

function down() {
    log("focus_down");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().y > focused.get_frame_rect().y;
            })
            .sort(function (a, b) {
                return window_distance(a, focused) - window_distance(b, focused);
            });
    });
}

function up() {
    log("focus_up");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().y < focused.get_frame_rect().y;
            })
            .sort(function (a, b) {
                return window_distance(a, focused) - window_distance(b, focused);
            });

    });
}

function right() {
    log("focus_right");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().x > focused.get_frame_rect().x;
            })
            .sort(function (a, b) {
                return window_distance(a, focused) - window_distance(b, focused);
            });
    });
}

function monitor_left() {
    log("focus_monitor_left");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_monitor() != Main.layoutManager.focusIndex;
            })
            .filter(function (win) {
                return win.get_frame_rect().x < focused.get_frame_rect().x;
            })
            .sort(function (a, b) {
                return window_distance(a, focused) - window_distance(b, focused);
            });
    });
}

function monitor_right() {
    log("focus_monitor_right");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_monitor() != Main.layoutManager.focusIndex;
            })
            .filter(function (win) {
                return win.get_frame_rect().x > focused.get_frame_rect().x;
            })
            .sort(function (a, b) {
                return window_distance(a, focused) - window_distance(b, focused);
            });
    });
}
