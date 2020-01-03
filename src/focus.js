const Me = imports.misc.extensionUtils.getCurrentExtension();

const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;
const Lib = Me.imports.lib;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

function xend(rect) {
    return rect.x + rect.width;
}

function xcenter(rect) {
    return rect.x + rect.width / 2;
}

function yend(rect) {
    return rect.y + rect.height;
}

function ycenter(rect) {
    return rect.y + rect.height / 2;
}

function center(rect) {
    return [xcenter(rect), ycenter(rect)];
}

function north(rect) {
    return [xcenter(rect), rect.y];
}

function east(rect) {
    return [xend(rect), ycenter(rect)];
}

function south(rect) {
    return [xcenter(rect), yend(rect)];
}

function west(rect) {
    return [rect.x, ycenter(rect)];
}

function directional_distance(win_a, win_b, fn_a, fn_b) {
    let [ax, ay] = fn_a(win_a.get_frame_rect());
    let [bx, by] = fn_b(win_b.get_frame_rect());

    return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2));
}

function window_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, center, center);
}

function upward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, south, north);
}

function rightward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, west, east);
}

function downward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, north, south);
}

function leftward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, east, west);
}

function focus(windows) {
    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    windows(focused, global.display.get_tab_list(Meta.TabList.NORMAL, workspace))
        .forEach(function (win, i) {
            Lib.log("  " + win.get_title());
            if (i == 0) {
                win.activate(global.get_current_time());

                let rect = win.get_frame_rect();
                let x = xcenter(rect);
                let y = ycenter(rect);
                    
                let display = Gdk.DisplayManager.get().get_default_display();

                display.get_default_seat()
                    .get_pointer()
                    .warp(display.get_default_screen(), x, y);
            }
        });
}

function left() {
    Lib.log("focus_left");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().x < focused.get_frame_rect().x;
            })
            .sort(function (a, b) {
                return leftward_distance(a, focused) - leftward_distance(b, focused);
            });
    });
}

function down() {
    Lib.log("focus_down");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().y > focused.get_frame_rect().y;
            })
            .sort(function (a, b) {
                return downward_distance(a, focused) - downward_distance(b, focused);
            });
    });
}

function up() {
    Lib.log("focus_up");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().y < focused.get_frame_rect().y;
            })
            .sort(function (a, b) {
                return upward_distance(a, focused) - upward_distance(b, focused);
            });

    });
}

function right() {
    Lib.log("focus_right");

    focus(function (focused, windows) {
        return windows
            .filter(function (win) {
                return win.get_frame_rect().x > focused.get_frame_rect().x;
            })
            .sort(function (a, b) {
                return rightward_distance(a, focused) - rightward_distance(b, focused);
            });
    });
}

function monitor_left() {
    Lib.log("focus_monitor_left");

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
    Lib.log("focus_monitor_right");

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
