const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Ecs from 'ecs';
import * as Lib from 'lib';
import * as Log from 'log';
import * as Rect from 'rectangle';

import type { Entity } from 'ecs';
import type { Rectangle } from './rectangle';
import type { ShellWindow } from './window';
import type { Ext } from './extension';

const { orientation_as_str } = Lib;

export enum NodeKind {
    FORK = 1,
    WINDOW = 2,
}

const XPOS = 0;
const YPOS = 1;
const WIDTH = 2;
const HEIGHT = 3;

/**
 * The world containing all forks and their attached windows, which is responible for
 * handling all automatic tiling and reflowing as windows are moved, closed, and resized
 */
export class AutoTiler extends Ecs.World {
    toplevel: Map<String, [Entity, [number, number]]>;
    forks: Ecs.Storage<TilingFork>;

    private string_reps: Ecs.Storage<string>;

    private on_attach: (parent: Entity, child: Entity) => void

    constructor() {
        super();

        /// Maintains a list of top-level forks.
        this.toplevel = new Map();

        // Needed when we're storing the entities in a map, because JS limitations.
        this.string_reps = this.register_storage();

        /// The storage for holding all fork associations
        this.forks = this.register_storage();

        // The callback to execute when a window has been attached to a fork.
        this.on_attach = () => { };
    }

    /**
     * Attaches a `new` window to the fork which `onto` is attached to.
     */
    attach_window(ext: Ext, onto_entity: Entity, new_entity: Entity): [Entity, TilingFork] | null {
        Log.debug(`attaching Window(${new_entity}) onto Window(${onto_entity})`);

        for (const [entity, fork] of this.forks.iter()) {
            if (fork.left.is_window(onto_entity)) {
                const node = TilingNode.window(new_entity);
                if (fork.right) {
                    const area = fork.area_of_left(ext);
                    const result = this.create_fork(fork.left, node, area, fork.workspace);
                    fork.left = TilingNode.fork(result[0]);
                    Log.debug(`attached Fork(${result[0]}) to Fork(${entity}).left`);
                    result[1].set_parent(entity);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, result);
                } else {
                    fork.right = node;
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, null);
                }
            } else if (fork.right && fork.right.is_window(onto_entity)) {
                const area = fork.area_of_right(ext);
                const result = this.create_fork(fork.right, TilingNode.window(new_entity), area, fork.workspace);
                fork.right = TilingNode.fork(result[0]);
                Log.debug(`attached Fork(${result[0]}) to Fork(${entity}).right`);
                result[1].set_parent(entity);
                return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, result);
            }
        }

        return null;
    }

    /**
     * Assigns the callback to trigger when a window is attached to a fork
     */
    connect_on_attach(callback: (parent: Entity, child: Entity) => void): AutoTiler {
        this.on_attach = callback;
        return this;
    }

    /**
     * Creates a new fork entity in the world
     *
     * @return Entity
     */
    create_entity(): Entity {
        const entity = super.create_entity();
        this.string_reps.insert(entity, `${entity}`);
        return entity;
    }

    /**
     * Create a new fork, where the left portion is a window `Entity`
     */
    create_fork(left: TilingNode, right: TilingNode | null, area: Rectangle | null, workspace: number): [Entity, TilingFork] {
        const entity = this.create_entity();
        let fork = new TilingFork(left, right, area, workspace);

        fork.set_orientation(area && area.width > area.height ? Lib.Orientation.HORIZONTAL : Lib.Orientation.VERTICAL);

        this.forks.insert(entity, fork);
        return [entity, fork];
    }

    /**
     * Create a new top level fork
     */
    create_toplevel(window: Entity, area: Rectangle, id: [number, number]): [Entity, TilingFork] {
        const [entity, fork] = this.create_fork(TilingNode.window(window), null, area, id[1]);
        this.string_reps.with(entity, (sid) => {
            fork.set_toplevel(this, entity, sid, id);
        });

        return [entity, fork];
    }

    /**
     * Deletes a fork entity from the world, performing any cleanup necessary
     */
    delete_entity(entity: Entity) {
        const fork = this.forks.remove(entity);
        if (fork && fork.is_toplevel) {
            const id = this.string_reps.get(entity);
            if (id) this.toplevel.delete(id);
        }

        super.delete_entity(entity);
    }

    /**
     * Detaches an entity from the a fork, re-arranging the fork's tree as necessary
     */
    detach(fork_entity: Entity, window: Entity): [Entity, TilingFork] | null {
        let reflow_fork = null;

        this.forks.with(fork_entity, (fork) => {
            Log.debug(`detaching Window(${window}) from Fork(${fork_entity})`);

            if (fork.left.is_window(window)) {
                if (fork.parent && fork.right) {
                    Log.debug(`detaching Fork(${fork_entity}) and holding Window(${fork.right.entity}) for reassignment`);
                    reflow_fork = [fork.parent, this.reassign_child_to_parent(fork_entity, fork.parent, fork.right)];
                } else if (fork.right) {
                    reflow_fork = [fork_entity, fork];
                    if (fork.right.kind == NodeKind.WINDOW) {
                        const detached = fork.right;
                        fork.left = detached;
                        fork.right = null;
                    } else {
                        this.reassign_children_to_parent(fork_entity, fork.right.entity, fork);
                    }
                } else {
                    Log.debug(`deleting childless and parentless Fork(${fork_entity})`);
                    this.delete_entity(fork_entity);
                }
            } else if (fork.right && fork.right.is_window(window)) {
                // Same as the `fork.left` branch.
                if (fork.parent) {
                    Log.debug(`detaching Fork(${fork_entity}) and holding Window(${fork.left.entity}) for reassignment`);
                    reflow_fork = [fork.parent, this.reassign_child_to_parent(fork_entity, fork.parent, fork.left)];
                } else {
                    reflow_fork = [fork_entity, fork];

                    if (fork.left.kind == NodeKind.FORK) {
                        this.reassign_children_to_parent(fork_entity, fork.left.entity, fork);
                    } else {
                        fork.right = null;
                    }
                }
            }
        });

        if (reflow_fork) {
            Log.debug(`reflowing Fork(${reflow_fork[0]})`);
        }

        return reflow_fork;
    }

    /**
     * Creates a string representation of every fork in the world; formatted for human consumption
     */
    display(ext: Ext, fmt: string) {
        for (const [entity, _] of this.toplevel.values()) {
            Log.debug(`displaying fork (${entity})`);
            const fork = this.forks.get(entity);

            fmt += ' ';
            if (fork) {
                fmt += this._display_fork(ext, entity, fork, 1) + '\n';
            } else {
                fmt += `Fork(${entity}) Invalid\n`;
            }
        }

        return fmt;
    }

    /**
     * Finds the top level fork associated with the given entity
     */
    find_toplevel(id: [number, number]): Entity | null {
        for (const [entity, [mon, work]] of this.toplevel.values()) {
            if (mon == id[0] && work == id[1]) {
                Log.log(`found top level at Fork(${entity})`);
                return entity;
            }
        }

        return null;
    }

    /**
     * Grows a sibling a fork
     */
    grow_sibling(ext: Ext, fork_e: Entity, fork_c: TilingFork, is_left: boolean, movement: Lib.Movement, crect: Rectangle, failure_allowed: boolean) {
        if (fork_c.area) {
            if (fork_c.is_horizontal()) {
                if ((movement & (Lib.Movement.DOWN | Lib.Movement.UP)) != 0) {
                    Log.debug(`growing Fork(${fork_e}) up/down`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 3, failure_allowed);
                } else if (is_left) {
                    if ((movement & Lib.Movement.RIGHT) != 0) {
                        Log.debug(`growing left child of Fork(${fork_e}) from left to right`);
                        this.readjust_fork_ratio_by_left(ext, crect.width, fork_c, fork_c.area.width, failure_allowed);
                    } else {
                        Log.debug(`growing left child of Fork(${fork_e}) from right to left`);
                        this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2, failure_allowed);
                    }
                } else if ((movement & Lib.Movement.RIGHT) != 0) {
                    Log.debug(`growing right child of Fork(${fork_e}) from left to right`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2, failure_allowed);
                } else {
                    Log.debug(`growing right child of Fork(${fork_e}) from right to left`);
                    this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area.width, failure_allowed);
                }
            } else {
                if ((movement & (Lib.Movement.LEFT | Lib.Movement.RIGHT)) != 0) {
                    Log.debug(`growing Fork(${fork_e}) left/right`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 2, failure_allowed);
                } else if (is_left) {
                    if ((movement & Lib.Movement.DOWN) != 0) {
                        Log.debug(`growing left child of Fork(${fork_e}) from top to bottom`);
                        this.readjust_fork_ratio_by_left(ext, crect.height, fork_c, fork_c.area.height, failure_allowed);
                    } else {
                        Log.debug(`growing left child of Fork(${fork_e}) from bottom to top`);
                        this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3, failure_allowed);
                    }
                } else if ((movement & Lib.Movement.DOWN) != 0) {
                    Log.debug(`growing right child of Fork(${fork_e}) from top to bottom`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3, failure_allowed);
                } else {
                    Log.debug(`growing right child of Fork(${fork_e}) from bottom to top`);
                    this.readjust_fork_ratio_by_right(ext, crect.height, fork_c, fork_c.area.height, failure_allowed);
                }
            }
        }
    }

    * iter(entity: Entity, kind: NodeKind): IterableIterator<TilingNode> {
        let fork = this.forks.get(entity);
        let forks = new Array(2);

        while (fork) {
            if (fork.left.kind == NodeKind.FORK) {
                forks.push(this.forks.get(fork.left.entity));
            }

            if (kind === null || fork.left.kind == kind) {
                yield fork.left
            }

            if (fork.right) {
                if (fork.right.kind == NodeKind.FORK) {
                    forks.push(this.forks.get(fork.right.entity));
                }

                if (kind === null || fork.right.kind == kind) {
                  yield fork.right;
                }
            }

            fork = forks.pop();
        }
    }

    /**
     * Finds the largest window on a monitor + workspace
     */
    largest_window_on(ext: Ext, entity: Entity): ShellWindow | null {
        let largest_window = null;
        let largest_size = 0;

        for (const win of this.iter(entity, NodeKind.WINDOW)) {
            const window = ext.windows.get(win.entity);

            if (window) {
                const rect = window.rect();
                const size = rect.width * rect.height;
                if (size > largest_size) {
                    largest_size = size;
                    largest_window = window;
                }
            }
        }

        return largest_window;
    }

    /**
     * Reassigns the child of a fork to the parent
     */
    reassign_child_to_parent(child_entity: Entity, parent_entity: Entity, branch: TilingNode): TilingFork | null {
        Log.debug(`reassigning Fork(${child_entity}) to parent Fork(${parent_entity})`);
        const parent = this.forks.get(parent_entity);

        if (parent) {
            if (parent.left.is_fork(child_entity)) {
                parent.left = branch;
                Log.debug(`reassigned Fork(${parent_entity}).left to (${parent.left.entity})`);
            } else {
                parent.right = branch;
                Log.debug(`reassigned Fork(${parent_entity}).right to (${parent.right.entity})`);
            }

            this.reassign_sibling(branch, parent_entity);
            this.delete_entity(child_entity);
        }

        return parent
    }

    /**
     * Reassigns a sibling based on whether it is a fork or a window.
     *
     * - If the sibling is a fork, reassign the parent.
     * - If it is a window, simply call on_attach
     */
    reassign_sibling(sibling: TilingNode, parent: Entity) {
        (sibling.kind == NodeKind.FORK ? this.reassign_parent : this.on_attach)
            .call(this, parent, sibling.entity);
    }

    /**
     * Reassigns children of the child entity to the parent entity
     *
     * Each fork has a left and optional right child entity
     */
    reassign_children_to_parent(parent_entity: Entity, child_entity: Entity, p_fork: TilingFork) {
        Log.debug(`reassigning children of Fork(${child_entity}) to Fork(${parent_entity})`);

        const c_fork = this.forks.get(child_entity);

        if (c_fork) {
            p_fork.left = c_fork.left;
            p_fork.right = c_fork.right;

            this.reassign_sibling(p_fork.left, parent_entity);
            if (p_fork.right) this.reassign_sibling(p_fork.right, parent_entity);

            this.delete_entity(child_entity);
        } else {
            Log.error(`Fork(${child_entity}) does not exist`);
        }
    }

    /**
     * Reassigns a child to the given parent
     */
    reassign_parent(parent: Entity, child: Entity) {
        Log.debug(`assigning parent of Fork(${child}) to Fork(${parent})`);
        this.forks.with(child, (fork) => fork.set_parent(parent));
    }

    /**
     * Resizes the sibling of a fork
     */
    resize(ext: Ext, fork_e: Entity, win_e: Entity, movement: Lib.Movement, crect: Rectangle, failure_allowed: boolean) {
        this.forks.with(fork_e, (fork_c) => {
            const is_left = fork_c.left.is_window(win_e);

            ((movement & Lib.Movement.SHRINK) != 0 ? this.shrink_sibling : this.grow_sibling)
                .call(this, ext, fork_e, fork_c, is_left, movement, crect, failure_allowed);
        });
    }

    resize_parent(parent: TilingFork, child: TilingFork, is_left: boolean) {
        if (!child.area || !parent.area || child.area.eq(parent.area)) return;

        Log.debug(`before ratio: ${parent.ratio}; (${child.area?.array} : ${parent.area?.array})`);

        const measure = parent.is_horizontal() ? 2 : 3;
        parent.set_ratio(
            parent.ratio = is_left
                ? child.area.array[measure]
                : (parent.area.array[measure] - child.area.array[measure]),
            parent.area.array[measure]
        );

        Log.debug(`after ratio: ${parent.ratio}`);
    }

    /// Readjusts the division of space between the left and right siblings of a fork
    readjust_fork_ratio_by_left(ext: Ext, left_length: number, fork: TilingFork, fork_length: number, failure_allowed: boolean) {
        if (fork.area) {
            const prev_ratio = fork.ratio;
            if (!fork.set_ratio(left_length, fork_length).tile(this, ext, fork.area, fork.workspace, failure_allowed) || failure_allowed) {
                fork.ratio = prev_ratio;
                fork.tile(this, ext, fork.area, fork.workspace, failure_allowed);
            }
        }
    }

    /// Readjusts the division of space between the left and right siblings of a fork
    ///
    /// Determines the size of the left sibling based on the new length of the right sibling
    readjust_fork_ratio_by_right(ext: Ext, right_length: number, fork: TilingFork, fork_length: number, failure_allowed: boolean) {
        this.readjust_fork_ratio_by_left(ext, fork_length - right_length, fork, fork_length, failure_allowed);
    }

    resize_fork_in_direction(ext: Ext, child_e: Entity, child: TilingFork, is_left: boolean, consider_sibling: boolean, crect: Rectangle, measure: number, failure_allowed: boolean) {
        Log.debug(`resizing fork in direction ${measure}: considering ${consider_sibling}`);
        if (child.area && child.area_left) {
            const original = new Rect.Rectangle([crect.x, crect.y, crect.width, crect.height]);
            let length = (measure == 2 ? crect.width : crect.height);

            if (consider_sibling) {
                length += is_left
                    ? child.area.array[measure] - child.area_left.array[measure]
                    : child.area_left.array[measure];
            }

            const shrinking = length < child.area.array[measure];
            Log.debug(`shrinking? ${shrinking}`);

            let done = false;
            let prev_area = child.area.clone();
            while (child.parent && !done) {
                Log.debug(`length = ${length}`);
                const parent = this.forks.get(child.parent);
                if (parent && parent.area) {
                    prev_area = parent.area.clone();
                    if (parent.area.contains(original)) {
                        if (shrinking) {
                            Log.debug(`Fork(${child_e}) area before: ${child.area}`);
                            if (child.area) child.area.array[measure] = length;
                            Log.debug(`Fork(${child_e}) area after ${child.area}`);
                        } else {
                            Log.info("breaking");
                            if (child.area) child.area.array[measure] = length;
                            this.resize_parent(parent, child, parent.left.is_fork(child_e));
                            done = true;
                        }
                    } else if (shrinking) {
                        Log.info("breaking");
                        this.resize_parent(parent, child, parent.left.is_fork(child_e));
                        done = true;
                    } else {
                        Log.debug(`Fork(${child_e}) area before: ${child.area}`);
                        if (child.area) child.area.array[measure] = length;
                        parent.area.array[measure] = length;
                        Log.debug(`Fork(${child_e}) area after ${child.area}`);
                    }

                    this.resize_parent(parent, child, parent.left.is_fork(child_e));

                    child_e = child.parent;
                    child = parent;
                } else {
                    break
                }
            }


            if (!child.tile(this, ext, child.area as Rectangle, child.workspace, failure_allowed) && !failure_allowed) {
                Log.debug(`failure resizing Fork(${child_e})`);
                child.tile(this, ext, prev_area, child.workspace, failure_allowed);
            }
        }
    }

    /**
     * Shrinks the sibling of a fork, possibly shrinking the fork itself.
     */
    shrink_sibling(ext: Ext, fork_e: Entity, fork_c: TilingFork, is_left: boolean, movement: Lib.Movement, crect: Rectangle, failure_allowed: boolean) {
        if (fork_c.area) {
            if (fork_c.is_horizontal()) {
                if ((movement & (Lib.Movement.DOWN | Lib.Movement.UP)) != 0) {
                    Log.debug(`shrinking Fork(${fork_e}) up/down`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 3, failure_allowed);
                } else if (is_left) {
                    if ((movement & Lib.Movement.LEFT) != 0) {
                        Log.debug(`shrinking left child of Fork(${fork_e}) from right to left`);
                        this.readjust_fork_ratio_by_left(ext, crect.width, fork_c, fork_c.area.array[2], failure_allowed);
                    } else {
                        Log.debug(`shrinking left child of Fork(${fork_e}) from left to right`);
                        this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2, failure_allowed);
                    }
                } else if ((movement & Lib.Movement.LEFT) != 0) {
                    Log.debug(`shrinking right child of Fork(${fork_e}) from right to left`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2, failure_allowed);
                } else {
                    Log.debug(`shrinking right child of Fork(${fork_e}) from left to right`);
                    this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area.array[2], failure_allowed);
                }
            } else {
                if ((movement & (Lib.Movement.LEFT | Lib.Movement.RIGHT)) != 0) {
                    Log.debug(`shrinking Fork(${fork_e}) left/right`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 2, failure_allowed);
                } else if (is_left) {
                    if ((movement & Lib.Movement.UP) != 0) {
                        Log.debug(`shrinking left child of Fork(${fork_e}) from bottom to top`);
                        this.readjust_fork_ratio_by_left(ext, crect.height, fork_c, fork_c.area.array[3], failure_allowed);
                    } else {
                        Log.debug(`shrinking left child of Fork(${fork_e}) from top to bottom`);
                        this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3, failure_allowed);
                    }
                } else if ((movement & Lib.Movement.UP) != 0) {
                    Log.debug(`shrinking right child of Fork(${fork_e}) from bottom to top`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3, failure_allowed);
                } else {
                    Log.debug(`shrinking right child of Fork(${fork_e}) from top to bottom`);
                    this.readjust_fork_ratio_by_right(ext, crect.height, fork_c, fork_c.area.array[3], failure_allowed);
                }
            }
        }
    }

    _attach(
        onto_entity: Entity,
        new_entity: Entity,
        assoc: (a: Entity, b: Entity) => void,
        entity: Entity,
        fork: TilingFork,
        result: [Entity, TilingFork] | null
    ): [Entity, TilingFork] | null {
        if (result) {
            assoc(result[0], onto_entity);
            assoc(result[0], new_entity);
        } else {
            assoc(entity, new_entity);
        }

        return [entity, fork];
    }

    _display_branch(ext: Ext, branch: TilingNode, scope: number): string {
        if (branch.kind == NodeKind.WINDOW) {
            const window = ext.windows.get(branch.entity);
            return `Window(${branch.entity}) (${window ? window.rect().fmt() : "unknown area"})`;
        } else {
            const fork = this.forks.get(branch.entity);
            return fork ? this._display_fork(ext, branch.entity, fork, scope + 1) : "Missing Fork";
        }
    }

    _display_fork(ext: Ext, entity: Entity, fork: TilingFork, scope: number): string {
        let fmt = `Fork(${entity}) [${fork.area ? fork.area.array : "unknown"}]: {\n`;

        fmt += ' '.repeat((1 + scope) * 2) + `workspace: (${fork.workspace}),\n`;
        fmt += ' '.repeat((1 + scope) * 2) + 'left:  ' + this._display_branch(ext, fork.left, scope) + ',\n';

        if (fork.right) {
            fmt += ' '.repeat((1 + scope) * 2) + 'right: ' + this._display_branch(ext, fork.right, scope) + ',\n';
        }

        fmt += ' '.repeat(scope * 2) + '}';
        return fmt;
    }
}

/// A node within the `AutoTiler`, which may contain either windows and/or sub-forks.
export class TilingFork {
    left: TilingNode;
    right: TilingNode | null;
    area: Rectangle | null;
    area_left: Rectangle | null = null;
    parent: Entity | null = null;
    workspace: number;
    ratio: number = .5;
    minimum_ratio: number = 0.1;
    orientation: Lib.Orientation = Lib.Orientation.HORIZONTAL;
    is_toplevel: boolean = false;

    constructor(left: TilingNode, right: TilingNode | null, area: Rectangle | null, workspace: number) {
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

    set_orientation(orientation: number): TilingFork {
        this.orientation = orientation;
        this.set_minimum_ratio();
        return this;
    }

    set_parent(parent: Entity): TilingFork {
        this.parent = parent;
        return this;
    }

    set_ratio(left_length: number, fork_length: number): TilingFork {
        this.ratio = Math.min(Math.max(this.minimum_ratio, left_length / fork_length), 1.0 - this.minimum_ratio);

        Log.debug(`new ratio: ${this.ratio}`);
        return this;
    }

    set_toplevel(tiler: AutoTiler, entity: Entity, string: string, id: [number, number]): TilingFork {
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
        Log.debug(`fork area = ${this_area.fmt()}`);

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

interface NodeFork {
    kind: 1;
    entity: Entity;
}

interface NodeWindow {
    kind: 2;
    entity: Entity;
}

type NodeADT = NodeFork | NodeWindow;

/// A tiling node may either refer to a window entity, or another fork entity.
export class TilingNode {
    private inner: NodeADT;

    constructor(kind: NodeKind, entity: Entity) {
        this.inner = { kind: kind, entity: entity };
    }

    /// Create a fork variant of a `TilingNode`
    static fork(fork: Entity): TilingNode {
        return new TilingNode(NodeKind.FORK, fork);
    }

    /// Create the window variant of a `TilingNode`
    static window(window: Entity): TilingNode {
        return new TilingNode(NodeKind.WINDOW, window);
    }

    get entity(): Entity { return this.inner.entity; }

    set entity(entity: Entity) { this.inner.entity = entity; }

    get kind(): NodeKind { return this.inner.kind; }

    set kind(kind: NodeKind ) { this.inner.kind = kind; }

    /// Generates a string representation of the this value.
    display(fmt: string): string {
        fmt += `{\n    kind: ${node_variant_as_string(this.kind)},\n    entity: (${this.entity})\n  }`;
        return fmt;
    }

    /// Asks if this fork is the fork we are looking for
    is_fork(entity: Entity): boolean {
        return NodeKind.FORK == this.kind && Ecs.entity_eq(this.entity, entity);
    }

    /// Asks if this window is the window we are looking for
    is_window(entity: Entity): boolean {
        return NodeKind.WINDOW == this.kind && Ecs.entity_eq(this.entity, entity);
    }

    /// Tiles all windows associated with this node
    tile(tiler: AutoTiler, ext: Ext, area: Rectangle, workspace: number): boolean {
        if (NodeKind.FORK == this.kind) {
            // Log.debug(`tiling Fork(${this.entity}) into [${area.array}]`);
            const fork = tiler.forks.get(this.entity);
            if (fork) {
                return fork.tile(tiler, ext, area, workspace, true);
            }
        } else {
            // Log.debug(`tiling Window(${this.entity}) into [${area.array}]`);
            const window = ext.windows.get(this.entity);

            if (window) {
                window.meta.change_workspace_by_index(workspace, false);

                if (ext.switch_workspace_on_move) {
                    global.display.get_workspace_manager()
                        .get_workspace_by_index(workspace)
                        .activate(global.get_current_time())
                }

                return window.move(area);
            }
        }

        return false;
    }
}

function node_variant_as_string(value: number): string {
    return value == NodeKind.FORK ? "NodeVariant::Fork" : "NodeVariant::Window";
}
