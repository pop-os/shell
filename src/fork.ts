// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Forest } from './forest';
import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Rectangle } from 'rectangle';
import type { Node } from 'node';

import * as Lib from 'lib';
import * as Log from 'log';
import * as Rect from 'rectangle';

const XPOS = 0;
const YPOS = 1;
const WIDTH = 2;
const HEIGHT = 3;

/** A tiling fork contains two children nodes.
 *
 * These nodes may either be windows, or sub-forks.
 */
export class Fork {
    left: Node;
    right: Node | null;
    area: Rectangle;
    area_left: Rectangle;
    entity: Entity;
    workspace: number;
    ratio: number = .5;
    ratio_prev: number = .5;
    minimum_ratio: number = 0.1;
    orientation: Lib.Orientation = Lib.Orientation.HORIZONTAL;
    is_toplevel: boolean = false;

    constructor(ext: Ext, entity: Entity, left: Node, right: Node | null, area: Rectangle, workspace: number) {
        this.area = area;
        this.left = left;
        this.right = right;
        this.workspace = workspace;
        this.area_left = this.area_of_left(ext);
        this.entity = entity;
    }

    /** The calculated left area of this fork */
    area_of_left(ext: Ext): Rect.Rectangle {
        return new Rect.Rectangle(
            this.right
                ? this.is_horizontal()
                    ? [this.area.x, this.area.y, (this.area.width * this.ratio) - ext.gap_inner_half, this.area.height]
                    : [this.area.x, this.area.y, this.area.width, (this.area.height * this.ratio) - ext.gap_inner_half]
                : [this.area.x, this.area.y, this.area.width, this.area.height]
        );
    }

    /** The calculated right area of this fork */
    area_of_right(ext: Ext): Rect.Rectangle {
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

    /** If this fork has a horizontal orientation */
    is_horizontal(): boolean {
        return Lib.Orientation.HORIZONTAL == this.orientation;
    }

    /** Replaces the association of a window in a fork with another */
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

    /** Sets a new area for this fork */
    set_area(area: Rectangle): Rectangle {
        this.area = area;
        this.set_minimum_ratio();
        return this.area;
    }

    /** Defines a minimum ratio based based on a minimum sibling length */
    private set_minimum_ratio() {
        this.minimum_ratio = this.orientation == Lib.Orientation.HORIZONTAL ? 256 / this.area.width : 256 / this.area.height;
    }

    /** Sets the orientation of this fork */
    set_orientation(orientation: Lib.Orientation): Fork {
        this.orientation = orientation;
        this.set_minimum_ratio();
        return this;
    }

    /** Sets the ratio of this fork
     *
     * Ensures that the ratio is never smaller or larger than the constraints.
     */
    set_ratio(left_length: number, fork_length: number): Fork {
        this.ratio_prev = this.ratio;
        this.ratio = Lib.round_to(Math.min(Math.max(this.minimum_ratio, left_length / fork_length), 1.0 - this.minimum_ratio), 2);

        Log.debug(`new ratio: ${this.ratio}`);
        return this;
    }

    /** Defines this fork as a top level fork, and records it in the forest */
    set_toplevel(tiler: Forest, entity: Entity, string: string, id: [number, number]): Fork {
        this.is_toplevel = true;
        tiler.toplevel.set(string, [entity, id]);
        return this;
    }

    /** Calculates the future arrangement of windows in this fork */
    measure(
        tiler: Forest,
        ext: Ext,
        area: Rectangle,
        record: (win: Entity, parent: Entity, area: Rectangle) => void
    ) {
        if (!this.is_toplevel) {
            this.area = this.set_area(area.clone());
        }

        if (this.right) {
            const [l, p] = this.is_horizontal() ? [WIDTH, XPOS] : [HEIGHT, YPOS];
            const length = Math.round(this.area.array[l] * this.ratio);

            let region = this.area.clone();

            region.array[l] = length - ext.gap_inner_half;

            this.area_left = region.clone();

            this.left.measure(tiler, ext, this.entity, region, record);

            region.array[p] = region.array[p] + length + ext.gap_inner_half;
            region.array[l] = this.area.array[l] - length - ext.gap_inner_half;

            this.right.measure(tiler, ext, this.entity, region, record);
        } else {
            this.left.measure(tiler, ext, this.entity, this.area, record)
        }
    }

    rebalance_orientation() {
        Log.debug(`rebalancing orientation`);
        this.orientation = this.area.height > this.area.width
            ? Lib.Orientation.VERTICAL
            : Lib.Orientation.HORIZONTAL;
        Log.debug(`orientation: ${Lib.orientation_as_str(this.orientation)} from (${this.area.fmt()})`);
    }

    /** Toggles the orientation of this fork */
    toggle_orientation() {
        this.orientation = Lib.Orientation.HORIZONTAL == this.orientation
            ? Lib.Orientation.VERTICAL
            : Lib.Orientation.HORIZONTAL;
    }
}
