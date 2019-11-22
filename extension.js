const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

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

function window_app_name(win) {
    let app = Shell.WindowTracker.get_default().get_window_app(win);
    let name = null;
    try {
      name = app.get_name().replace(/&/g, "&amp;");
    } catch (e) {
      log("window_app_name: " + e);
    }
    return name;
}

function window_distance(win_a, win_b) {
    let a = win_a.get_frame_rect();
    let b = win_b.get_frame_rect();
    return Math.sqrt(
        Math.pow(b.x - a.x, 2) +
        Math.pow(b.y - a.y, 2)
    );
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}

function focus_left() {
    log("focus_left");

    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter(function (win) {
            return win.get_frame_rect().x < focused.get_frame_rect().x;
        })
        .sort(function(a, b) {
            return window_distance(a, focused) - window_distance(b, focused);
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function focus_down() {
    log("focus_down");

    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter(function (win) {
            return win.get_frame_rect().y > focused.get_frame_rect().y;
        })
        .sort(function(a, b) {
            return window_distance(a, focused) - window_distance(b, focused);
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function focus_up() {
    log("focus_up");

    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter(function (win) {
            return win.get_frame_rect().y < focused.get_frame_rect().y;
        })
        .sort(function(a, b) {
            return window_distance(a, focused) - window_distance(b, focused);
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function focus_right() {
    log("focus_right");

    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter(function (win) {
            return win.get_frame_rect().x > focused.get_frame_rect().x;
        })
        .sort(function(a, b) {
            return window_distance(a, focused) - window_distance(b, focused);
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function focus_monitor_left() {
    log("focus_monitor_left");

    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter(function (win) {
            return win.get_monitor() != Main.layoutManager.focusIndex;
        })
        .filter(function (win) {
            return win.get_frame_rect().x < focused.get_frame_rect().x;
        })
        .sort(function(a, b) {
            return window_distance(a, focused) - window_distance(b, focused);
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function focus_monitor_right() {
    log("focus_monitor_right");

    let focused = global.display.focus_window;
    if (!focused) return;
    let workspace = global.workspace_manager.get_active_workspace();
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
        .filter(function (win) {
            return win.get_monitor() != Main.layoutManager.focusIndex;
        })
        .filter(function (win) {
            return win.get_frame_rect().x > focused.get_frame_rect().x;
        })
        .sort(function(a, b) {
            return window_distance(a, focused) - window_distance(b, focused);
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function search() {
    log("search");

    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, null);
    windows.forEach(function (win) {
        let name = window_app_name(win);
        let title = "";
        if (name) {
            title += name + ": ";
        }
        title += win.get_title();
        log("  " + title);
    });
}

let tiling_overlay;

function tile_monitors(rect) {
    log("tile_monitors(" + rect.x + ", " + rect.y + ", " + rect.width + ", " + rect.height);

    let workspace = global.workspace_manager.get_active_workspace();
    return Main.layoutManager.monitors.map((monitor, i) => {
        return workspace.get_work_area_for_monitor(i);
    }).filter((monitor) => {
        return (rect.x + rect.width) > monitor.x &&
            (rect.y + rect.height) > monitor.y &&
            rect.x < (monitor.x + monitor.width) &&
            rect.y < (monitor.y + monitor.height);
    }).sort(function(a, b) {
        // Sort by total size
        return (a.width * a.height) - (b.width * b.height);
    });
}

function tile_rect() {
    log("tile_rect");

    if (!tiling_overlay.visible) return null;

    let monitors = tile_monitors(tiling_overlay);
    if (monitors.length == 0) return null;

    return {
        "x": monitors[0].x,
        "y": monitors[0].y,
        "width": monitors[0].width / 8,
        "height": monitors[0].height / 8,
    };
}

function tile_change(dx, dy, dw, dh) {
    log("tile_change(" + dx + "," + dy + "," + dw + "," + dh + ")");

    let rect = tile_rect();
    if (!rect) return;

    let changed = {
        "x": tiling_overlay.x + dx * rect.width,
        "y": tiling_overlay.y + dy * rect.height,
        "width": tiling_overlay.width + dw * rect.width,
        "height": tiling_overlay.height + dh * rect.height,
    };

    // Align to grid
    changed.x = round_increment(changed.x - rect.x, rect.width) + rect.x;
    changed.y = round_increment(changed.y - rect.y, rect.height) + rect.y;
    changed.width = round_increment(changed.width, rect.width);
    changed.height = round_increment(changed.height, rect.height);

    // Ensure that width is not too small
    if (changed.width < rect.width) {
        changed.width = rect.width;
    }

    // Ensure that height is not too small
    if (changed.height < rect.height) {
        changed.height = rect.height;
    }

    // Check that corrected rectangle fits on monitors
    let monitors = tile_monitors(changed);

    // Do not use change if there are no matching displays
    if (monitors.length == 0) return;

    let min_x = null;
    let min_y = null;
    let max_x = null;
    let max_y = null;
    monitors.forEach((monitor) => {
        if (min_x === null || monitor.x < min_x) {
            min_x = monitor.x;
        }
        if (min_y === null || monitor.y < min_y) {
            min_y = monitor.y;
        }
        if (max_x === null || (monitor.x + monitor.width) > max_x) {
            max_x = monitor.x + monitor.width;
        }
        if (max_y === null || (monitor.y + monitor.height) < max_y) {
            max_y = monitor.y + monitor.height;
        }
    });

    // Do not use change if maxima cannot be found
    if (min_x === null || min_y === null || max_x === null || max_y === null) {
        return;
    }

    // Prevent moving too far left
    if (changed.x < min_x) return;
    // Prevent moving too far right
    if ((changed.x + changed.width) > max_x) return;
    // Prevent moving too far up
    if (changed.y < min_y) return;
    // Prevent moving too far down
    if ((changed.y + changed.height) > max_y) return;

    tiling_overlay.x = changed.x;
    tiling_overlay.y = changed.y;
    tiling_overlay.width = changed.width;
    tiling_overlay.height = changed.height;
}

function tile_move_left() {
    log("tile_move_left");
    tile_change(-1, 0, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_move_down() {
    log("tile_move_down");
    tile_change(0, 1, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_move_up() {
    log("tile_move_up");
    tile_change(0, -1, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_move_right() {
    log("tile_move_right");
    tile_change(1, 0, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_resize_left() {
    log("tile_resize_left");
    tile_change(0, 0, -1, 0);
    tile_change(0, 0, 0, 0);
}

function tile_resize_down() {
    log("tile_resize_down");
    tile_change(0, 0, 0, 1);
    tile_change(0, 0, 0, 0);
}

function tile_resize_up() {
    log("tile_resize_up");
    tile_change(0, 0, 0, -1);
    tile_change(0, 0, 0, 0);
}

function tile_resize_right() {
    log("tile_resize_right");
    tile_change(0, 0, 1, 0);
    tile_change(0, 0, 0, 0);
}

function tile_swap_left() {
    log("tile_swap_left");
    let rect = tile_rect();
    if (!rect) return;
    tile_change(-tiling_overlay.width/rect.width, 0, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_swap_down() {
    log("tile_swap_down");
    let rect = tile_rect();
    if (!rect) return;
    tile_change(0, tiling_overlay.height/rect.height, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_swap_up() {
    log("tile_swap_up");
    let rect = tile_rect();
    if (!rect) return;
    tile_change(0, -tiling_overlay.height/rect.height, 0, 0);
    tile_change(0, 0, 0, 0);
}

function tile_swap_right() {
    log("tile_swap_right");
    let rect = tile_rect();
    if (!rect) return;
    tile_change(tiling_overlay.width/rect.width, 0, 0, 0);
    tile_change(0, 0, 0, 0);
}

let tiling_keybindings = {
    "tile-move-left": () => tile_move_left(),
    "tile-move-down": () => tile_move_down(),
    "tile-move-up": () => tile_move_up(),
    "tile-move-right": () => tile_move_right(),
    "tile-resize-left": () => tile_resize_left(),
    "tile-resize-down": () => tile_resize_down(),
    "tile-resize-up": () => tile_resize_up(),
    "tile-resize-right": () => tile_resize_right(),
    "tile-swap-left": () => tile_swap_left(),
    "tile-swap-down": () => tile_swap_down(),
    "tile-swap-up": () => tile_swap_up(),
    "tile-swap-right": () => tile_swap_right(),
    "tile-accept": () => tile_accept(),
    "tile-reject": () => tile_exit(),
};

let tiling_window = null;

function tile_enter() {
    log("tile_enter");

    if (!tiling_window) {
        tiling_window = global.display.focus_window;
        if (!tiling_window) return;

        // Set overlay to match window
        let rect = tiling_window.get_frame_rect();
        tiling_overlay.x = rect.x;
        tiling_overlay.y = rect.y;
        tiling_overlay.width = rect.width;
        tiling_overlay.height = rect.height;

        // Make overlay visible
        tiling_overlay.visible = true;

        // Make sure overlay is valid
        tile_change(0, 0, 0, 0);

        // Enable tiling keybinding
        enable_keybindings(tiling_keybindings);
    }
}

function tile_accept() {
    log("tile_accept");

    if (tiling_window) {
        // Unmaximize
        tiling_window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
        tiling_window.unmaximize(Meta.MaximizeFlags.VERTICAL);
        tiling_window.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

        // Apply changes
        tiling_window.move_resize_frame(
            true,
            tiling_overlay.x,
            tiling_overlay.y,
            tiling_overlay.width,
            tiling_overlay.height
        );
    }

    tile_exit();
}

function tile_exit() {
    log("tile_exit");

    if (tiling_window) {
        tiling_window = null;

        // Disable overlay
        tiling_overlay.visible = false;

        // Disable tiling keybindings
        disable_keybindings(tiling_keybindings);

    }
}

let global_keybindings = {
    "focus-left": () => focus_left(),
    "focus-down": () => focus_down(),
    "focus-up": () => focus_up(),
    "focus-right": () => focus_right(),
    "focus-monitor-left": () => focus_monitor_left(),
    "focus-monitor-right": () => focus_monitor_right(),
    //"search": () => search(),
    "tile-enter": () => tile_enter(),
};


function init() {
    log("init");
}

function enable() {
    log("enable");
    // Add tiling overlay
    tiling_overlay = new St.BoxLayout({
        style_class: "tile-preview"
    });
    Main.uiGroup.add_actor(tiling_overlay);
    // Enable global keybindings
    enable_keybindings(global_keybindings);
}

function disable() {
    log("disable");
    // Remove tiling overlay
    Main.uiGroup.remove_actor(tiling_overlay);
    // Exit tiling mode if necessary
    tile_exit();
    // Disable global keybindings
    disable_keybindings(global_keybindings);
}
