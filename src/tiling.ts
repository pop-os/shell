const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';
import * as Tags from 'tags';
import * as Log from 'log';
import * as GrabOp from 'grab_op';
import * as Rect from 'rectangle';

import type { ShellWindow } from './window';
import type { Rectangle } from './rectangle';
import type { Ext } from './extension';

const Main = imports.ui.main;

export class Tiler {
    private ext: Ext;
    private keybindings: Object;

    private window: ShellWindow | null = null;
    private swap_window: ShellWindow | null = null;

    constructor(ext: Ext) {
        this.ext = ext;

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

    rect(): Rectangle | null {
        if (!this.ext.overlay.visible) return null;

        let monitors = tile_monitors(this.ext.overlay);
        if (monitors.length == 0) return null;

        const columns = monitors[0].width / this.ext.column_size;
        const rows = monitors[1].height / this.ext.row_size;

        return monitor_rect(monitors[0], columns, rows);
    }

    change(overlay: any, rect: Rectangle, dx: number, dy: number, dw: number, dh: number): Tiler {
        let changed = new Rect.Rectangle([
            overlay.x + dx * rect.width,
            overlay.y + dy * rect.height,
            overlay.width + dw * rect.width,
            overlay.height + dh * rect.height,
        ]);

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
        let monitors = tile_monitors(changed);

        // Do not use change if there are no matching displays
        if (monitors.length == 0) return this;

        let min_x: number | null = null;
        let min_y: number | null = null;
        let max_x: number | null = null;
        let max_y: number | null = null;

        for (const monitor of monitors) {
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
        }

        // Do not use change if maxima cannot be found
        if (min_x === null || min_y === null || max_x === null || max_y === null) {
            return this;
        }

        // Prevent moving too far left
        if (changed.x < min_x) return this;
        // Prevent moving too far right
        if ((changed.x + changed.width) > max_x) return this;
        // Prevent moving too far up
        if (changed.y < min_y) return this;
        // Prevent moving too far down
        if ((changed.y + changed.height) > max_y) return this;

        const left_most = changed.x < this.ext.column_size;
        const right_most = changed.x + changed.width >= monitors[0].height - this.ext.column_size;

        if (left_most && right_most) {
            changed.x += this.ext.gap_outer;
            changed.width -= (this.ext.gap_outer * 2);
        } else if (left_most) {
            changed.x += this.ext.gap_outer;
            changed.width -= this.ext.gap_inner_half + this.ext.gap_outer;
        } else if (right_most) {
            changed.x += this.ext.gap_inner_half;
            changed.width -= this.ext.gap_inner_half + this.ext.gap_outer;
        } else {
            changed.x += this.ext.gap_inner_half;
            changed.width -= this.ext.gap_inner;
        }

        const top_most = changed.y < this.ext.row_size;
        const bottom_most = changed.y + changed.height >= monitors[0].height - this.ext.row_size;

        if (top_most && bottom_most) {
            changed.y += this.ext.gap_outer;
            changed.height -= (this.ext.gap_outer * 2);
        } else if (top_most) {
            changed.y += this.ext.gap_outer;
            changed.height -= this.ext.gap_inner_half + this.ext.gap_outer;
        } else if (bottom_most) {
            changed.y += this.ext.gap_inner_half;
            changed.height -= this.ext.gap_inner_half + this.ext.gap_outer;
        } else {
            changed.y += this.ext.gap_inner_half;
            changed.height -= this.ext.gap_inner;
        }

        overlay.x = changed.x;
        overlay.y = changed.y;
        overlay.width = changed.width;
        overlay.height = changed.height;
        return this;
    }

    move(x: number, y: number, w: number, h: number) {
        if (this.ext.auto_tiler) {
            this.move_auto(x, y);
        } else {
            this.swap_window = null;

            let rect = this.rect();

            if (rect) {
                this.change(this.ext.overlay, rect, x, y, w, h)
                    .change(this.ext.overlay, rect, 0, 0, 0, 0);
            }
        }
    }

    move_auto_(func: (a: any, b: Rectangle) => void) {
        if (this.ext.auto_tiler && this.ext.attached && this.window) {
            const entity = this.ext.attached.get(this.window.entity);
            if (entity) {
                const fork = this.ext.auto_tiler.forks.get(entity);
                if (fork) {
                    const grab_op = new GrabOp.GrabOp(this.window.entity, this.window.rect());

                    let crect = grab_op.rect.clone();
                    func(fork, crect);

                    const result = this.ext.monitors.get(this.window.entity);
                    if (result) {
                        const [monitor, _] = result;
                        Lib.meta_rect_clamp(this.ext.monitor_work_area(monitor), crect, this.ext.gap_outer);

                        if (crect.eq(grab_op.rect)) {
                            return;
                        }

                        this.ext.auto_tiler.resize(this.ext, entity, this.window.entity, grab_op.operation(crect), crect);
                        this.ext.set_overlay(this.window.rect());
                    }
                }
            }
        }
    }

    move_auto(x: number, y: number) {
        this.move_auto_((fork, crect) => {
            let xadj = x * this.ext.row_size;
            let yadj = y * this.ext.column_size;

            if (this.window) {
                if (fork.left.is_window(this.window.entity)) {
                    Log.debug(`left window move`);
                    crect.width += xadj;
                    crect.height += yadj;
                } else if (fork.is_horizontal()) {
                    Log.debug(`right window horizontal move`);
                    crect.width += xadj;
                    crect.height += yadj;
                } else {
                    Log.debug(`right window vertical move`);
                    crect.width += xadj;
                    crect.height += yadj;
                }
            }
        });
    }

    resize_auto(x: number, y: number) {
        this.move_auto_((fork, crect) => {
            let xadj = x * this.ext.row_size;
            let yadj = y * this.ext.column_size;

            if (this.window) {
                if (fork.left.is_window(this.window.entity)) {
                    Log.debug(`left window resize`);
                    crect.width += xadj;
                    crect.height += yadj;
                } else if (fork.is_horizontal()) {
                    Log.debug(`right window horizontal resize`);
                    crect.width += -1 * xadj;
                    crect.height += yadj;
                    crect.x += xadj;
                } else {
                    Log.debug(`right window vertical resize`);
                    crect.width += xadj;
                    crect.height += -1 * yadj;
                    crect.y += yadj;
                }
            }
        });
    }

    move_left() {
        this.move(-1, 0, 0, 0);
    }

    move_down() {
        this.move(0, 1, 0, 0);
    }

    move_up() {
        this.move(0, -1, 0, 0);
    }

    move_right() {
        this.move(1, 0, 0, 0);
    }

    resize(x: number, y: number, w: number, h: number) {
        if (this.ext.auto_tiler) {
            this.resize_auto(w, h);
        } else {
            this.swap_window = null;
            let rect = this.rect();
            if (rect) {
                this.change(this.ext.overlay, rect, x, y, w, h)
                    .change(this.ext.overlay, rect, 0, 0, 0, 0);
            }
        }
    }

    resize_left() {
        this.resize(0, 0, -1, 0);
    }

    resize_down() {
        this.resize(0, 0, 0, 1);
    }

    resize_up() {
        this.resize(0, 0, 0, -1);
    }

    resize_right() {
        this.resize(0, 0, 1, 0);
    }

    swap(selector: ShellWindow | null) {
        if (selector) {
            this.ext.set_overlay(selector.rect());
            this.swap_window = selector;
        }
    }

    swap_left() {
        this.swap(this.ext.focus_selector.left(this.swap_window));
    }

    swap_down() {
        this.swap(this.ext.focus_selector.down(this.swap_window));
    }

    swap_up() {
        this.swap(this.ext.focus_selector.up(this.swap_window));
    }

    swap_right() {
        this.swap(this.ext.focus_selector.right(this.swap_window));
    }

    enter() {
        if (!this.window) {
            this.window = this.ext.focus_window();
            if (!this.window) return;

            // Set overlay to match window
            this.ext.set_overlay(this.window.rect());
            this.ext.overlay.visible = true;

            if (!this.ext.auto_tiler) {
                let rect = this.rect();
                // Make sure overlay is valid
                if (rect) this.change(this.ext.overlay, rect, 0, 0, 0, 0);
            }

            this.ext.keybindings.disable(this.ext.keybindings.window_focus)
                .enable(this.keybindings);
        }
    }

    accept() {
        if (this.window) {
            if (this.swap_window) {
                if (this.ext.auto_tiler) {
                    this.ext.attach_swap(this.swap_window.entity, this.window.entity);
                }
                this.swap_window.move(this.window.rect());
                this.swap_window = null;
            }

            this.window.move(this.ext.overlay);
            this.ext.add_tag(this.window.entity, Tags.Tiled);
        }

        this.exit();
    }

    exit() {
        if (this.window) {
            this.window = null;

            // Disable overlay
            this.ext.overlay.visible = false;

            // Disable tiling keybindings
            this.ext.keybindings.disable(this.keybindings)
                .enable(this.ext.keybindings.window_focus);
        }
    }

    snap(win: ShellWindow) {
        let mon_geom = this.ext.monitor_work_area(win.meta.get_monitor());
        if (mon_geom) {
            let rect = win.rect();
            const columns = mon_geom.width / this.ext.column_size;
            const rows = mon_geom.height / this.ext.row_size;
            this.change(
                rect,
                monitor_rect(mon_geom, columns, rows),
                0, 0, 0, 0
            );

            win.move(rect);

            this.ext.snapped.insert(win.entity, true);
        }
    }
};

function monitor_rect(monitor: Rectangle, columns: number, rows: number): Rectangle {
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

    return new Rect.Rectangle([monitor.x, monitor.y, tile_width, tile_height]);
}

function tile_monitors(rect: Rectangle): Array<Rectangle> {
    let total_size = (a: Rectangle, b: Rectangle): number => (a.width * a.height) - (b.width * b.height);

    let workspace = global.workspace_manager.get_active_workspace();
    return Main.layoutManager.monitors
        .map((monitor: Rectangle, i: number) => workspace.get_work_area_for_monitor(i))
        .filter((monitor: Rectangle) => {
            return (rect.x + rect.width) > monitor.x &&
                (rect.y + rect.height) > monitor.y &&
                rect.x < (monitor.x + monitor.width) &&
                rect.y < (monitor.y + monitor.height);
        })
        .sort(total_size);
}
