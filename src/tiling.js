const Me = imports.misc.extensionUtils.getCurrentExtension();

const Lib = Me.imports.lib;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const TILES = 16;

class Tiler {
    constructor() {
        this.gap = Lib.settings.gap();
        this.half_gap = this.gap / 2;
        Lib.log("gap: " + this.gap);
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
        Lib.log("tile_monitors(" + rect.x + ", " + rect.y + ", " + rect.width + ", " + rect.height + ")");

        let workspace = global.workspace_manager.get_active_workspace();
        return Main.layoutManager.monitors.map((monitor, i) => {
            return workspace.get_work_area_for_monitor(i);
        }).filter((monitor) => {
            return (rect.x + rect.width) > monitor.x &&
                (rect.y + rect.height) > monitor.y &&
                rect.x < (monitor.x + monitor.width) &&
                rect.y < (monitor.y + monitor.height);
        }).sort(function (a, b) {
            // Sort by total size
            return (a.width * a.height) - (b.width * b.height);
        });
    }

    rect() {
        Lib.log("tile_rect");

        if (!this.overlay.visible) return null;

        let monitors = this.monitors(this.overlay);
        if (monitors.length == 0) return null;
        let monitor = monitors[0];

        let tile_width = monitor.width / TILES;
        let tile_height = monitor.height / TILES;

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

    change(dx, dy, dw, dh) {
        Lib.log("tile_change(" + dx + "," + dy + "," + dw + "," + dh + ")");

        let rect = this.rect();
        if (!rect) return;

        let changed = {
            "x": this.overlay.x + dx * rect.width,
            "y": this.overlay.y + dy * rect.height,
            "width": this.overlay.width + dw * rect.width,
            "height": this.overlay.height + dh * rect.height,
        };

        // Align to grid
        changed.x = Lib.round_increment(changed.x - rect.x, rect.width) + rect.x;
        changed.y = Lib.round_increment(changed.y - rect.y, rect.height) + rect.y;
        changed.width = Lib.round_increment(changed.width, rect.width);
        changed.height = Lib.round_increment(changed.height, rect.height);

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
        let right_most = (changed.x % monitors[0].width) + changed.width >= (TILES - 1) * rect.width;

        if (!(left_most && right_most)) {
            if (left_most) {
                Lib.log("left-most");
                changed.width -= this.half_gap;
            } else if (right_most) {
                Lib.log("right-most");
                changed.x += this.half_gap;
                changed.width -= this.half_gap;
            } else {
                Lib.log("width-between");
                changed.x += this.half_gap;
                changed.width -= this.gap;
            }
        }

        let top_most = (changed.y % monitors[0].height) < 28;
        let bottom_most = (changed.y % monitors[0].height) + changed.height >= (TILES - 1) * rect.height

        if (!(top_most && bottom_most)) {
            if (top_most) {
                Lib.log("top-most");
                changed.height -= this.half_gap;
            } else if (bottom_most) {
                Lib.log("bottom-most");
                changed.y += this.half_gap;
                changed.height -= this.half_gap;
            } else {
                Lib.log("height-between");
                changed.y += this.half_gap;
                changed.height -= this.gap;
            }
        }

        this.overlay.x = changed.x;
        this.overlay.y = changed.y;
        this.overlay.width = changed.width;
        this.overlay.height = changed.height;
    }

    move_left() {
        Lib.log("tile_move_left");
        this.change(-1, 0, 0, 0);
        this.change(0, 0, 0, 0);
    }

    move_down() {
        Lib.log("tile_move_down");
        this.change(0, 1, 0, 0);
        this.change(0, 0, 0, 0);
    }

    move_up() {
        Lib.log("tile_move_up");
        this.change(0, -1, 0, 0);
        this.change(0, 0, 0, 0);
    }

    move_right() {
        Lib.log("tile_move_right");
        this.change(1, 0, 0, 0);
        this.change(0, 0, 0, 0);
    }

    resize_left() {
        Lib.log("tile_resize_left");
        this.change(0, 0, -1, 0);
        this.change(0, 0, 0, 0);
    }

    resize_down() {
        Lib.log("tile_resize_down");
        this.change(0, 0, 0, 1);
        this.change(0, 0, 0, 0);
    }

    resize_up() {
        Lib.log("tile_resize_up");
        this.change(0, 0, 0, -1);
        this.change(0, 0, 0, 0);
    }

    resize_right() {
        Lib.log("tile_resize_right");
        this.change(0, 0, 1, 0);
        this.change(0, 0, 0, 0);
    }

    swap_left() {
        Lib.log("tile_swap_left");
        let rect = this.rect();
        if (!rect) return;
        this.change(-this.overlay.width / rect.width, 0, 0, 0);
        this.change(0, 0, 0, 0);
    }

    swap_down() {
        Lib.log("tile_swap_down");
        let rect = this.rect();
        if (!rect) return;
        this.change(0, this.overlay.height / rect.height, 0, 0);
        this.change(0, 0, 0, 0);
    }

    swap_up() {
        Lib.log("tile_swap_up");
        let rect = this.rect();
        if (!rect) return;
        this.change(0, -this.overlay.height / rect.height, 0, 0);
        this.change(0, 0, 0, 0);
    }

    swap_right() {
        Lib.log("tile_swap_right");
        let rect = this.rect();
        if (!rect) return;
        this.change(this.overlay.width / rect.width, 0, 0, 0);
        this.change(0, 0, 0, 0);
    }

    enter() {
        Lib.log("tile_enter");

        if (!this.window) {
            Lib.log("tiling window");
            this.window = global.display.focus_window;
            if (!this.window) return;

            Lib.log("setting overlay");
            // Set overlay to match window
            let rect = this.window.get_frame_rect();
            this.overlay.x = rect.x;
            this.overlay.y = rect.y;
            this.overlay.width = rect.width;
            this.overlay.height = rect.height;

            // Make overlay visible
            this.overlay.visible = true;

            // Make sure overlay is valid
            this.change(0, 0, 0, 0);

            Lib.log("enabling keybindings");
            // Enable tiling keybinding
            Lib.enable_keybindings(this.keybindings);
        }
    }

    accept() {
        Lib.log("tile_accept");

        if (this.window) {
            // Unmaximize
            this.window.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
            this.window.unmaximize(Meta.MaximizeFlags.VERTICAL);
            this.window.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

            // Apply changes
            this.window.move_resize_frame(
                true,
                this.overlay.x,
                this.overlay.y,
                this.overlay.width,
                this.overlay.height
            );
        }

        this.exit();
    }

    exit() {
        Lib.log("tile_exit");

        if (this.window) {
            this.window = null;

            // Disable overlay
            this.overlay.visible = false;

            // Disable tiling keybindings
            Lib.disable_keybindings(this.keybindings);
        }
    }
}


