const Me = imports.misc.extensionUtils.getCurrentExtension();

const { log, round_increment, Keybindings } = Me.imports.lib;
const Main = imports.ui.main;
const { Meta, St } = imports.gi;


var Tiler = class Tiler {
    constructor() {
        this.gap = Keybindings.settings.gap();
        this.half_gap = this.gap / 2;
        this.columns = 16;
        this.rows = 16;

        this.window = null;
        this.overlay = new St.BoxLayout({
            style_class: "tile-preview"
        });

        this.keybindings = {
            "tile-move-left": () => this.move_left(),
            "tile-move-down": () => this.move_down(),
            "tile-move-up": () => this.move_up(),
            "tile-move-right": () => this.move_right(),
            "tile-resize-left": () => this.resize_left(),
            "tile-resize-down": () => this.resize_down(),
            "tile-resize-up": () => this.resize_up(),
            "tile-resize-right": () => this.resize_right(),
            "tile-swap-left": () => this.swap_left(),
            "tile-swap-down": () => this.swap_down(),
            "tile-swap-up": () => this.swap_up(),
            "tile-swap-right": () => this.swap_right(),
            "tile-accept": () => this.accept(),
            "tile-reject": () => this.exit(),
        };
    }

    monitors(rect) {
        log("tile_monitors(" + rect.x + ", " + rect.y + ", " + rect.width + ", " + rect.height + ")");

        let total_size = (a, b) => (a.width * a.height) - (b.width * b.height);

        let workspace = global.workspace_manager.get_active_workspace();
        return Main.layoutManager.monitors
            .map((monitor, i) => workspace.get_work_area_for_monitor(i))
            .filter((monitor) => {
                return (rect.x + rect.width) > monitor.x &&
                    (rect.y + rect.height) > monitor.y &&
                    rect.x < (monitor.x + monitor.width) &&
                    rect.y < (monitor.y + monitor.height);
            })
            .sort(total_size);
    }

    rect() {
        if (!this.overlay.visible) return null;

        let monitors = this.monitors(this.overlay);
        if (monitors.length == 0) return null;

        return monitor_rect(monitors[0], this.columns, this.rows);
    }

    change(overlay, rect, dx, dy, dw, dh) {
        log("tile_change(" + dx + "," + dy + "," + dw + "," + dh + ")");

        if (!rect) return;

        let changed = {
            "x": overlay.x + dx * rect.width,
            "y": overlay.y + dy * rect.height,
            "width": overlay.width + dw * rect.width,
            "height": overlay.height + dh * rect.height,
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
        let monitors = this.monitors(changed);

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

        let left_most = (changed.x % monitors[0].width) == 0;
        let right_most = (changed.x % monitors[0].width) + changed.width >= (this.columns - 1) * rect.width;

        if (!(left_most && right_most)) {
            if (left_most) {
                changed.width -= this.half_gap;
            } else if (right_most) {
                changed.x += this.half_gap;
                changed.width -= this.half_gap;
            } else {
                changed.x += this.half_gap;
                changed.width -= this.gap;
            }
        }

        let top_most = (changed.y % monitors[0].height) < 28;
        let bottom_most = (changed.y % monitors[0].height) + changed.height >= (this.rows - 1) * rect.height

        if (!(top_most && bottom_most)) {
            if (top_most) {
                changed.height -= this.half_gap;
            } else if (bottom_most) {
                changed.y += this.half_gap;
                changed.height -= this.half_gap;
            } else {
                changed.y += this.half_gap;
                changed.height -= this.gap;
            }
        }

        overlay.x = changed.x;
        overlay.y = changed.y;
        overlay.width = changed.width;
        overlay.height = changed.height;
    }

    move_left() {
        this.change(this.overlay, this.rect(), -1, 0, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    move_down() {
        this.change(this.overlay, this.rect(), 0, 1, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    move_up() {
        this.change(this.overlay, this.rect(), 0, -1, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    move_right() {
        this.change(this.overlay, this.rect(), 1, 0, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    resize_left() {
        this.change(this.overlay, this.rect(), 0, 0, -1, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    resize_down() {
        this.change(this.overlay, this.rect(), 0, 0, 0, 1);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    resize_up() {
        this.change(this.overlay, this.rect(), 0, 0, 0, -1);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    resize_right() {
        this.change(this.overlay, this.rect(), 0, 0, 1, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    swap_left() {
        let rect = this.rect();
        if (!rect) return;
        this.change(this.overlay, this.rect(), -1, 0, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    swap_down() {
        let rect = this.rect();
        if (!rect) return;
        this.change(this.overlay, this.rect(), 0, 1, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    swap_up() {
        let rect = this.rect();
        if (!rect) return;
        this.change(this.overlay, this.rect(), 0, -1, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    swap_right() {
        let rect = this.rect();
        if (!rect) return;
        this.change(this.overlay, this.rect(), 1, 0, 0, 0);
        this.change(this.overlay, this.rect(), 0, 0, 0, 0);
    }

    enter() {
        if (!this.window) {
            this.window = global.display.focus_window;
            if (!this.window) return;

            // Set overlay to match window
            let rect = this.window.get_frame_rect();
            this.overlay.x = rect.x;
            this.overlay.y = rect.y;
            this.overlay.width = rect.width;
            this.overlay.height = rect.height;
            this.overlay.visible = true;

            // Make sure overlay is valid
            this.change(this.overlay, this.rect(), 0, 0, 0, 0);

            Keybindings.enable(this.keybindings);
        }
    }

    accept() {
        if (this.window) {
            snap(this.window, this.overlay);
        }

        this.exit();
    }

    exit() {
        if (this.window) {
            this.window = null;

            // Disable overlay
            this.overlay.visible = false;

            // Disable tiling keybindings
            Keybindings.disable(this.keybindings);
        }
    }

    snap_windows(windows) {
        windows.forEach((win, i) => {
            let mon_geom = global.display.get_monitor_geometry(win.get_monitor());
            if (mon_geom) {
                var rect = win.get_frame_rect();
                this.change(
                    rect,
                    monitor_rect(mon_geom, this.columns, this.rows),
                    0, 0, 0, 0
                );

                snap(win, rect);
            }
        });
    }
};

function monitor_rect(monitor, columns, rows) {
    log("monitor_rect(" + monitor.x + ", " + monitor.y + ")");
    let tile_width = monitor.width / columns;
    let tile_height = monitor.height / rows;

    // Anything above 21:9 is considered ultrawide
    if (monitor.width * 9 >= monitor.height * 21) {
        tile_width /= 2;
    }

    // Anything below 9:21 is probably a rotated ultrawide
    if (monitor.height * 9 >= monitor.width * 21) {
        tile_height /= 2;
    }

    return {
        "x": monitor.x,
        "y": monitor.y,
        "width": tile_width,
        "height": tile_height,
    };
}

function snap(window, rect) {
    // Unmaximize
    window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    window.unmaximize(Meta.MaximizeFlags.VERTICAL);
    window.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

    // Apply changes
    window.move_resize_frame(
        true,
        rect.x,
        rect.y,
        rect.width,
        rect.height
    );
}
