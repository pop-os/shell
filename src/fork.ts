// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Forest } from './forest';
import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Rectangle } from 'rectangle';
import type { Node } from 'node';

import * as Ecs from 'ecs';
import * as Lib from 'lib';
import * as node from 'node';
import * as Rect from 'rectangle';
import { ShellWindow } from './window';

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
    entity: Entity;
    workspace: number;
    length_left: number;
    prev_length_left: number;
    minimum_ratio: number = 0.1;
    orientation: Lib.Orientation = Lib.Orientation.HORIZONTAL;

    orientation_changed: boolean = false;
    is_toplevel: boolean = false;

    /** Tracks toggle count so that we may swap branches when toggled twice */
    private n_toggled: number = 0;

    constructor(entity: Entity, left: Node, right: Node | null, area: Rectangle, workspace: number, orient: Lib.Orientation) {
        this.area = area;
        this.left = left;
        this.right = right;
        this.workspace = workspace;
        this.length_left = orient === Lib.Orientation.HORIZONTAL
            ? this.area.width / 2
            : this.area.height / 2;
        this.prev_length_left = this.length_left;
        this.entity = entity;
        this.orientation = orient;
    }

    /** The calculated left area of this fork */
    area_of_left(ext: Ext): Rect.Rectangle {
        return new Rect.Rectangle(
            this.is_horizontal()
                ? [this.area.x, this.area.y, this.length_left - ext.gap_inner_half, this.area.height]
                : [this.area.x, this.area.y, this.area.width, this.length_left - ext.gap_inner_half]
        );
    }

    /** The calculated right area of this fork */
    area_of_right(ext: Ext): Rect.Rectangle {
        let area: [number, number, number, number];

        if (this.is_horizontal()) {
            const width = this.area.width - this.length_left + ext.gap_inner;
            area = [width, this.area.y, this.area.width - width, this.area.height];
        } else {
            const height = this.area.height - this.length_left + ext.gap_inner;
            area = [this.area.x, height, this.area.width, this.area.height - height];
        }

        return new Rect.Rectangle(area);
    }

    depth(): number {
        return this.is_horizontal() ? this.area.height : this.area.width;
    }

    find_branch(entity: Entity): Node | null {
        const locate = (branch: Node): Node | null => {
            switch (branch.inner.kind) {
                case 2:
                    if (Ecs.entity_eq(branch.inner.entity, entity)) {
                        return branch;
                    }

                    break
                case 3:
                    for (const e of branch.inner.entities) {
                        if (Ecs.entity_eq(e, entity)) {
                            return branch;
                        }
                    }
            }

            return null;
        }

        const node = locate(this.left);
        if (node) return node;

        return this.right ? locate(this.right) : null;
    }

    /** If this fork has a horizontal orientation */
    is_horizontal(): boolean {
        return Lib.Orientation.HORIZONTAL == this.orientation;
    }

    length(): number {
        return this.is_horizontal() ? this.area.width : this.area.height;
    }

    /** Replaces the association of a window in a fork with another */
    replace_window(ext: Ext, a: ShellWindow, b: ShellWindow): boolean {
        if (!this.right) return false;

        switch (this.left.inner.kind) {
            case 2:
                if (Ecs.entity_eq(this.left.inner.entity, a.entity)) {
                    this.left.inner.entity = b.entity;
                } else if (this.right.inner.kind === 2) {
                    this.right.inner.entity = b.entity;
                } else if (this.right.inner.kind === 3) {
                    const idx = node.stack_find(this.right.inner, a.entity);
                    if (idx === null) return false;
                    node.stack_replace(ext, this.right.inner, idx, b.entity);
                    this.right.inner.entities[idx] = b.entity;
                }

                break
            case 3:
                let idx = node.stack_find(this.left.inner, a.entity);
                if (idx !== null) {
                    node.stack_replace(ext, this.left.inner, idx, b.entity);
                    this.left.inner.entities[idx] = b.entity;
                } else if (this.right.inner.kind === 2) {
                    this.right.inner.entity = b.entity;
                } else if (this.right.inner.kind === 3) {
                    const idx = node.stack_find(this.right.inner, a.entity);
                    if (idx === null) return false;
                    node.stack_replace(ext, this.right.inner, idx, b.entity);
                    this.right.inner.entities[idx] = b.entity;
                }
        }

        return true;
    }

    /** Sets a new area for this fork */
    set_area(area: Rectangle): Rectangle {
        this.area = area;
        return this.area;
    }

    /** Sets the ratio of this fork
     *
     * Ensures that the ratio is never smaller or larger than the constraints.
     */
    set_ratio(left_length: number): Fork {
        const fork_len = this.is_horizontal() ? this.area.width : this.area.height;
        const clamped = Math.round(Math.max(256, Math.min(fork_len - 256, left_length)));
        this.prev_length_left = clamped;
        this.length_left = clamped;
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
        let ratio;

        if (!this.is_toplevel) {
            if (this.orientation_changed) {
                this.orientation_changed = false;
                ratio = this.length_left / this.depth();
            } else {
                ratio = this.length_left / this.length();
            }

            this.area = this.set_area(area.clone());
        } else if (this.orientation_changed) {
            this.orientation_changed = false;
            ratio = this.length_left / this.depth();
        }

        if (ratio) {
            this.length_left = Math.round(ratio * this.length());
        }

        if (this.right) {
            const [l, p, startpos] = this.is_horizontal() ? [WIDTH, XPOS, this.area.x] : [HEIGHT, YPOS, this.area.y];

            let region = this.area.clone();

            const half = this.area.array[l] / 2;

            let length;
            if (this.length_left > half - 32 && this.length_left < half + 32) {
                length = half;
            } else {
                const diff = (startpos + this.length_left) % 32;
                length = this.length_left - diff + (diff > 16 ? 32 : 0);
                if (length == 0) length = 32;
            }

            region.array[l] = length - ext.gap_inner_half;

            this.left.measure(tiler, ext, this.entity, region, record);

            region.array[p] = region.array[p] + length + ext.gap_inner_half;
            region.array[l] = this.area.array[l] - length - ext.gap_inner_half;

            this.right.measure(tiler, ext, this.entity, region, record);
        } else {
            this.left.measure(tiler, ext, this.entity, this.area, record)
        }
    }

    migrate(ext: Ext, forest: Forest, area: Rectangle, monitor: number, workspace: number) {
        if (this.is_toplevel) {
            forest.toplevel.set(forest.string_reps.get(this.entity) as string, [this.entity, [monitor, workspace]]);

            if (this.workspace !== workspace) {
                this.workspace = workspace;
                for (const child_node of forest.iter(this.entity, node.NodeKind.FORK)) {
                    let child = forest.forks.get((child_node.inner as node.NodeFork).entity);
                    if (child) child.workspace = workspace;
                }
            }

            this.set_area(area.clone());
            this.measure(forest, ext, area, forest.on_record());
            forest.arrange(ext, workspace, true);
        } else {
            // TODO: Seperate into new tree?
        }
    }

    rebalance_orientation() {
        let new_orientation = this.area.height > this.area.width
            ? Lib.Orientation.VERTICAL
            : Lib.Orientation.HORIZONTAL;

        if (new_orientation !== this.orientation) {
            this.orientation = new_orientation;
            this.orientation_changed = true;
        }
    }

    /** Toggles the orientation of this fork */
    toggle_orientation() {
        this.orientation = Lib.Orientation.HORIZONTAL === this.orientation
            ? Lib.Orientation.VERTICAL
            : Lib.Orientation.HORIZONTAL;

        this.orientation_changed = true;
        if (this.n_toggled === 1) {
            if (this.right) {
                const tmp = this.right;
                this.right = this.left;
                this.left = tmp;
            }
            this.n_toggled = 0;
        } else {
            this.n_toggled += 1;
        }
    }
}
