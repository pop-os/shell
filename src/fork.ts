const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { AutoTiler } from 'auto_tiler';
import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Rectangle } from 'rectangle';
import type { Node } from 'node';

import * as Lib from 'lib';
import * as Log from 'log';
import * as Rect from 'rectangle';

const { orientation_as_str } = Lib;

const XPOS = 0;
const YPOS = 1;
const WIDTH = 2;
const HEIGHT = 3;

/// A tiling fork contains two children nodes. These nodes may either be windows, or sub-forks.
export class Fork {
    left: Node;
    right: Node | null;
    area: Rectangle | null;
    area_left: Rectangle | null = null;
    parent: Entity | null = null;
    workspace: number;
    ratio: number = .5;
    minimum_ratio: number = 0.1;
    orientation: Lib.Orientation = Lib.Orientation.HORIZONTAL;
    is_toplevel: boolean = false;

    constructor(left: Node, right: Node | null, area: Rectangle | null, workspace: number) {
        this.area = area;
        this.left = left;
        this.right = right;
        this.workspace = workspace;
    }

    area_of(ext: Ext, child: Entity): Rect.Rectangle | null {
        if (this.left.is_window(child)) {
            return this.area_of_left(ext);
        } else if (this.right?.is_window(child)) {
            return this.area_of_right(ext);
        } else {
            return null;
        }
    }

    area_of_left(ext: Ext): Rect.Rectangle | null {
        if (this.area) {
            return new Rect.Rectangle(
                this.right
                    ? this.is_horizontal()
                        ? [this.area.x, this.area.y, (this.area.width * this.ratio) - ext.gap_inner_half, this.area.height]
                        : [this.area.x, this.area.y, this.area.width, (this.area.height * this.ratio) - ext.gap_inner_half]
                    : [this.area.x, this.area.y, this.area.width, this.area.height]
            );
        }

        return null;
    }

    area_of_right(ext: Ext): Rect.Rectangle | null {
        if (this.area && this.right) {
            let area: [number, number, number, number];

            if (this.is_horizontal()) {
                const width = (this.area.width * this.ratio) + ext.gap_inner;
                area = [width, this.area.y, this.area.width - width, this.area.height];
            } else {
                const height = (this.area.height * this.ratio) + ext.gap_inner;
                area = [this.area.x, height, this.area.width, this.area.height - height];
            }

            return new Rect.Rectangle(area);
        }

        return null;
    }

    display(fmt: string) {
        fmt += `{\n  parent: ${this.parent},`;

        if (this.area) {
            fmt += `\n  area: (${this.area.array}),`;
        }

        fmt += `\n  workspace: (${this.workspace}),`;

        if (this.left) {
            fmt += `\n  left: ${this.left.display('')},`;
        }

        if (this.right) {
            fmt += `\n  right: ${this.right.display('')},`;
        }

        fmt += `\n  orientation: ${orientation_as_str(this.orientation)}\n}`;
        return fmt;
    }

    is_horizontal(): boolean {
        return Lib.Orientation.HORIZONTAL == this.orientation;
    }

    /// Replaces the association of a window in a fork with another
    replace_window(a: Entity, b: Entity): boolean {
        if (this.left.is_window(a)) {
            this.left.entity = b;
        } else if (this.right) {
            this.right.entity = b;
        } else {
            return false;
        }

        return true;
    }

    set_area(area: Rectangle): Rectangle {
        this.area = area;
        this.set_minimum_ratio();
        return this.area;
    }

    private set_minimum_ratio() {
        if (this.area) {
            this.minimum_ratio = this.orientation == Lib.Orientation.HORIZONTAL ? 256 / this.area.width : 256 / this.area.height;
        }
    }

    set_orientation(orientation: number): Fork {
        this.orientation = orientation;
        this.set_minimum_ratio();
        return this;
    }

    set_parent(parent: Entity): Fork {
        this.parent = parent;
        return this;
    }

    set_ratio(left_length: number, fork_length: number): Fork {
        this.ratio = Lib.round_to(Math.min(Math.max(this.minimum_ratio, left_length / fork_length), 1.0 - this.minimum_ratio), 2);

        Log.debug(`new ratio: ${this.ratio}`);
        return this;
    }

    set_toplevel(tiler: AutoTiler, entity: Entity, string: string, id: [number, number]): Fork {
        this.is_toplevel = true;
        tiler.toplevel.set(string, [entity, id]);
        return this;
    }

    /// Tiles all windows within this fork into the given area
    tile(tiler: AutoTiler, ext: Ext, area: Rectangle, workspace: number, failure_allowed: boolean): boolean {
        /// Memorize our area for future tile reflows
        const prev_left = this.area_of_left(ext) as Rectangle;
        const prev_right = this.area_of_right(ext) as Rectangle;

        if (!this.is_toplevel) {
            if (null === this.area && null === this.parent) {
                this.area = this.set_area(new Rect.Rectangle([
                    area.x + ext.gap_outer,
                    area.y + ext.gap_outer,
                    area.width - ext.gap_outer * 2,
                    area.height - ext.gap_outer * 2,
                ]));
            } else {
                this.area = this.set_area(area.clone());
            }
        }

        const this_area = this.area as Rectangle;

        this.workspace = workspace;

        if (this.right) {
            const [l, p] = this.is_horizontal() ? [WIDTH, XPOS] : [HEIGHT, YPOS];
            const length = Math.round(this_area.array[l] * this.ratio);

            let region = this_area.clone();

            region.array[l] = length - ext.gap_inner_half;

            this.area_left = region.clone();

            if (this.left.tile(tiler, ext, region, workspace) || failure_allowed) {
                region.array[p] = region.array[p] + length + ext.gap_inner;
                region.array[l] = this_area.array[l] - length - ext.gap_inner;

                if (this.right.tile(tiler, ext, region, workspace) || failure_allowed) {
                    return true;
                } else {
                    Log.debug(`failed to move right node`);

                    this.area_left = prev_left;
                    this.left.tile(tiler, ext, prev_left, workspace);
                    this.right.tile(tiler, ext, prev_right, workspace);
                }
            } else {
                Log.debug(`failed to move left node`);
                this.area_left = prev_left;
                this.left.tile(tiler, ext, prev_left, workspace);
            }
        } else if (this.left.tile(tiler, ext, this_area, workspace) || failure_allowed) {
            this.area_left = this_area;
            return true;
        }

        return false;
    }

    toggle_orientation() {
        this.orientation = Lib.Orientation.HORIZONTAL == this.orientation
            ? Lib.Orientation.VERTICAL
            : Lib.Orientation.HORIZONTAL;
    }
}
