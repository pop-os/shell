const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';
import * as Tags from 'tags';
import * as Log from 'log';
import * as GrabOp from 'grab_op';
import * as Rect from 'rectangle';

import type { Entity } from './ecs';
import type { ShellWindow } from './window';
import type { Rectangle } from './rectangle';
import type { Ext } from './extension';

const Main = imports.ui.main;

export class Tiler {
    private keybindings: Object;

    private window: Entity | null = null;
    private swap_window: Entity | null = null;

    constructor(ext: Ext) {
        this.keybindings = {
            "management-orientation": () => {
                if (this.window) ext.windows.with(this.window, (window) => {
                    ext.toggle_orientation();
                    ext.set_overlay(window.rect());
                });
            },

            "tile-move-left": () => this.move_left(ext),
            "tile-move-down": () => this.move_down(ext),
            "tile-move-up": () => this.move_up(ext),
            "tile-move-right": () => this.move_right(ext),
            "tile-resize-left": () => this.resize_left(ext),
            "tile-resize-down": () => this.resize_down(ext),
            "tile-resize-up": () => this.resize_up(ext),
            "tile-resize-right": () => this.resize_right(ext),
            "tile-swap-left": () => this.swap_left(ext),
            "tile-swap-down": () => this.swap_down(ext),
            "tile-swap-up": () => this.swap_up(ext),
            "tile-swap-right": () => this.swap_right(ext),
            "tile-accept": () => this.accept(ext),
            "tile-reject": () => this.exit(ext),
        };
    }

    rect(ext: Ext): Rectangle | null {
        if (!ext.overlay.visible) return null;

        let monitors = tile_monitors(ext.overlay);
        if (monitors.length == 0) return null;

        const columns = monitors[0].width / ext.column_size;
        const rows = monitors[0].height / ext.row_size;

        return monitor_rect(monitors[0], columns, rows);
    }

    change(ext: Ext, overlay: any, rect: Rectangle, dx: number, dy: number, dw: number, dh: number): Tiler {
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

        const left_most = changed.x < ext.column_size;
        const right_most = changed.x + changed.width >= monitors[0].height - ext.column_size;

        if (left_most && right_most) {
            changed.x += ext.gap_outer;
            changed.width -= (ext.gap_outer * 2);
        } else if (left_most) {
            changed.x += ext.gap_outer;
            changed.width -= ext.gap_inner_half + ext.gap_outer;
        } else if (right_most) {
            changed.x += ext.gap_inner_half;
            changed.width -= ext.gap_inner_half + ext.gap_outer;
        } else {
            changed.x += ext.gap_inner_half;
            changed.width -= ext.gap_inner;
        }

        const top_most = changed.y < ext.row_size;
        const bottom_most = changed.y + changed.height >= monitors[0].height - ext.row_size;

        if (top_most && bottom_most) {
            changed.y += ext.gap_outer;
            changed.height -= (ext.gap_outer * 2);
        } else if (top_most) {
            changed.y += ext.gap_outer;
            changed.height -= ext.gap_inner_half + ext.gap_outer;
        } else if (bottom_most) {
            changed.y += ext.gap_inner_half;
            changed.height -= ext.gap_inner_half + ext.gap_outer;
        } else {
            changed.y += ext.gap_inner_half;
            changed.height -= ext.gap_inner;
        }

        overlay.x = changed.x;
        overlay.y = changed.y;
        overlay.width = changed.width;
        overlay.height = changed.height;
        return this;
    }

    move(ext: Ext, x: number, y: number, w: number, h: number, focus: () => ShellWindow | null) {
        if (ext.auto_tiler) {
            this.move_auto(ext, focus());
        } else {
            this.swap_window = null;

            let rect = this.rect(ext);

            if (rect) {
                this.change(ext, ext.overlay, rect, x, y, w, h)
                    .change(ext, ext.overlay, rect, 0, 0, 0, 0);
            }
        }
    }

    move_auto_(ext: Ext, func: (a: any, b: Rectangle) => void) {
        if (ext.auto_tiler && ext.attached && this.window) {
            const entity = ext.attached.get(this.window);
            if (entity) {
                const fork = ext.auto_tiler.forks.get(entity);
                const window = ext.windows.get(this.window);
                if (fork && window) {
                    const grab_op = new GrabOp.GrabOp(this.window, window.rect());

                    let crect = grab_op.rect.clone();
                    func(fork, crect);

                    const result = ext.monitors.get(this.window);
                    if (result) {
                        const [monitor, _] = result;
                        Lib.meta_rect_clamp(ext.monitor_work_area(monitor), crect, ext.gap_outer);

                        if (crect.eq(grab_op.rect)) {
                            return;
                        }

                        ext.auto_tiler.resize(ext, entity, this.window, grab_op.operation(crect), crect, false);
                        ext.set_overlay(window.rect());
                    }
                }
            }
        }
    }

    resize_auto(ext: Ext, x: number, y: number) {
        this.move_auto_(ext, (fork, crect) => {
            let xadj = x * ext.row_size;
            let yadj = y * ext.column_size;

            if (this.window) {
                if (fork.left.is_window(this.window)) {
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

    move_auto(ext: Ext, move_to: ShellWindow | null) {
        const focused = ext.focus_window();
        if (focused && move_to) {
            const parent = ext.windows_are_siblings(focused.entity, move_to.entity);
            if (parent) {
                const fork = ext.auto_tiler?.forks.get(parent);
                if (fork) {
                    const temp = fork.left.entity;
                    fork.left.entity = (fork.right as any).entity;
                    (fork.right as any).entity = temp;
                    ext.tile(fork, fork.area as any, fork.workspace, false);
                    ext.set_overlay(focused.rect());
                    return;
                }
            }

            ext.detach_window(focused.entity);
            ext.attach_to_window(move_to, focused);
            ext.set_overlay(focused.rect());
        }
    }

    move_left(ext: Ext) {
        this.move(ext, -1, 0, 0, 0, () => ext.focus_selector.left(ext, null));
    }

    move_down(ext: Ext) {
        this.move(ext, 0, 1, 0, 0, () => ext.focus_selector.down(ext, null));
    }

    move_up(ext: Ext) {
        this.move(ext, 0, -1, 0, 0, () => ext.focus_selector.up(ext, null));
    }

    move_right(ext: Ext) {
        this.move(ext, 1, 0, 0, 0, () => ext.focus_selector.right(ext, null));
    }

    resize(ext: Ext, x: number, y: number, w: number, h: number) {
        if (ext.auto_tiler) {
            this.resize_auto(ext, w, h);
        } else {
            this.swap_window = null;
            let rect = this.rect(ext);
            if (rect) {
                this.change(ext, ext.overlay, rect, x, y, w, h)
                    .change(ext, ext.overlay, rect, 0, 0, 0, 0);
            }
        }
    }

    resize_left(ext: Ext) {
        this.resize(ext, 0, 0, -1, 0);
    }

    resize_down(ext: Ext) {
        this.resize(ext, 0, 0, 0, 1);
    }

    resize_up(ext: Ext) {
        this.resize(ext, 0, 0, 0, -1);
    }

    resize_right(ext: Ext) {
        this.resize(ext, 0, 0, 1, 0);
    }

    swap(ext: Ext, selector: ShellWindow | null) {
        if (selector) {
            ext.set_overlay(selector.rect());
            this.swap_window = selector.entity;
        }
    }

    swap_left(ext: Ext) {
        if (this.swap_window) {
            ext.windows.with(this.swap_window, (window) => {
                this.swap(ext, ext.focus_selector.left(ext, window));
            });
        } else {
            this.swap(ext, ext.focus_selector.left(ext, null));
        }
    }

    swap_down(ext: Ext) {
        if (this.swap_window) {
            ext.windows.with(this.swap_window, (window) => {
                this.swap(ext, ext.focus_selector.down(ext, window));
            });
        } else {
            this.swap(ext, ext.focus_selector.down(ext, null));
        }
    }

    swap_up(ext: Ext) {
        if (this.swap_window) {
            ext.windows.with(this.swap_window, (window) => {
                this.swap(ext, ext.focus_selector.up(ext, window));
            })
        } else {
            this.swap(ext, ext.focus_selector.up(ext, null));
        }

    }

    swap_right(ext: Ext) {
        if (this.swap_window) {
            ext.windows.with(this.swap_window, (window) => {
                this.swap(ext, ext.focus_selector.right(ext, window));
            });
        } else {
            this.swap(ext, ext.focus_selector.right(ext, null));
        }
    }

    enter(ext: Ext) {
        if (!this.window) {
            const meta = ext.focus_window();
            if (!meta) return;

            this.window = meta.entity;

            // Set overlay to match window
            ext.set_overlay(meta.rect());
            ext.overlay.visible = true;

            if (!ext.auto_tiler) {
                let rect = this.rect(ext);
                // Make sure overlay is valid
                if (rect) this.change(ext, ext.overlay, rect, 0, 0, 0, 0);
            }

            ext.keybindings.disable(ext.keybindings.window_focus)
                .enable(this.keybindings);
        }
    }

    accept(ext: Ext) {
        if (this.window) {
            const meta = ext.windows.get(this.window);
            if (meta) {
                if (this.swap_window) {
                    const meta_swap = ext.windows.get(this.swap_window);
                    if (meta_swap) {
                        if (ext.auto_tiler) {
                            ext.attach_swap(this.swap_window, this.window);
                        }
                        meta_swap.move(meta.rect());
                        this.swap_window = null;
                    }
                }

                meta.move(ext.overlay);
                ext.add_tag(this.window, Tags.Tiled);
            }
        }

        this.exit(ext);
    }

    exit(ext: Ext) {
        if (this.window) {
            this.window = null;

            // Disable overlay
            ext.overlay.visible = false;

            // Disable tiling keybindings
            ext.keybindings.disable(this.keybindings)
                .enable(ext.keybindings.window_focus);
        }
    }

    snap(ext: Ext, win: ShellWindow) {
        let mon_geom = ext.monitor_work_area(win.meta.get_monitor());
        if (mon_geom) {
            let rect = win.rect();
            const columns = mon_geom.width / ext.column_size;
            const rows = mon_geom.height / ext.row_size;
            this.change(
                ext,
                rect,
                monitor_rect(mon_geom, columns, rows),
                0, 0, 0, 0
            );

            win.move(rect);

            ext.snapped.insert(win.entity, true);
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
