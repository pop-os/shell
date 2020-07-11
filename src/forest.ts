// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Ecs from 'ecs';
import * as Lib from 'lib';
import * as Log from 'log';
import * as movement from 'movement';
import * as Rect from 'rectangle';
import * as Node from 'node';
import * as Fork from 'fork';

import type { Entity } from 'ecs';
import type { Rectangle } from './rectangle';
import type { ShellWindow } from './window';
import type { Ext } from './extension';

const { Meta } = imports.gi;
const { Movement } = movement;


/** A request to move a window into a new location. */
interface Request {
    parent: Entity,
    rect: Rectangle
}

/** A collection of forks separated into trees
 *
 * Each display on each workspace has their own unique tree. A tree is a
 * collection of starting from an uppermost fork, and branching into
 * deeply-nested sub-forks.
 *
 * Each fork represents two nodes and an orientation, whereby a node may either
 * be a window or another fork. As windows are attached to other windows,
 * forks will be dynamically removed and created to accomodate the new
 * arrangement.
 */
export class Forest extends Ecs.World {
    /** Maintains a list of top-level forks. */
    toplevel: Map<String, [Entity, [number, number]]> = new Map();

    /** Stores window positions that have been requested. */
    requested: Map<Entity, Request> = new Map();

    /** The storage for holding all fork associations. */
    forks: Ecs.Storage<Fork.Fork> = this.register_storage();

    /** Child-parent associations are stored here. */
    parents: Ecs.Storage<Entity> = this.register_storage();

    /** Needed when we're storing the entities in a map, because JS limitations. */
    string_reps: Ecs.Storage<string> = this.register_storage();

    /** The callback to execute when a window has been attached to a fork. */
    private on_attach: (parent: Entity, child: Entity) => void = () => { };

    constructor() {
        super();
    }

    measure(ext: Ext, fork: Fork.Fork, area: Rectangle) {
        fork.measure(this, ext, area, this.on_record());
    }

    /** Measures and arranges windows in the tree from the given fork to the specified area. */
    tile(ext: Ext, fork: Fork.Fork, area: Rectangle, ignore_reset: boolean = true) {
        this.measure(ext, fork, area);
        this.arrange(ext, fork.workspace, ignore_reset);
    }

    /** Place all windows into their calculated positions. */
    arrange(ext: Ext, _workspace: number, ignore_reset: boolean = false) {
        // const new_positions = new Array();
        for (const [entity, r] of this.requested) {
            const window = ext.windows.get(entity);
            if (!window) continue;

            let on_complete = () => { }
            if (ext.tiler.window) {
                if (Ecs.entity_eq(ext.tiler.window, entity)) {
                    on_complete = () => {
                        ext.set_overlay(window.rect());
                    }
                }
            }
            move_window(ext, window, r.rect, on_complete);
        }

        this.requested.clear();

        if (ignore_reset) return;

        // let reset = false;

        // outer:
        // for (const [, , new_area] of new_positions) {
        //     for (const [, , other] of new_positions) {
        //         if (!other.eq(new_area) && other.intersects(new_area)) {
        //             reset = true;
        //             break outer;
        //         }
        //     }
        // }

        // if (reset) {
        //     for (const [window, origin] of new_positions) {
        //         const signals = ext.size_signals.get(window.entity);
        //         if (signals) {
        //             move_window(window, origin, signals);
        //         }
        //     }
        // }
    }

    attach_fork(ext: Ext, fork: Fork.Fork, window: Entity, is_left: boolean) {
        const node = Node.Node.window(window);

        if (is_left) {
            if (fork.right) {
                const new_fork = this.create_fork(fork.left, fork.right, fork.area_of_right(ext), fork.workspace)[0];
                fork.right = Node.Node.fork(new_fork);
            } else {
                fork.right = fork.left;
            }

            fork.left = node;
        } else {
            if (fork.right) {
                const new_fork = this.create_fork(fork.left, fork.right, fork.area_of_left(ext), fork.workspace)[0];
                fork.left = Node.Node.fork(new_fork);
            }

            fork.right = node;
        }

        this.on_attach(fork.entity, window);
    }

    /** Attaches a `new` window to the fork which `onto` is attached to. */
    attach_window(ext: Ext, onto_entity: Entity, new_entity: Entity, cursor: Rectangle): [Entity, Fork.Fork] | null {
        const right_node = Node.Node.window(new_entity);

        for (const [entity, fork] of this.forks.iter()) {
            if (fork.left.is_window(onto_entity)) {
                if (fork.right) {
                    const area = fork.area_of_left(ext);
                    const [fork_entity, new_fork] = this.create_fork(fork.left, right_node, area, fork.workspace);

                    const inner_left = new_fork.is_horizontal()
                        ? new Rect.Rectangle([new_fork.area.x, new_fork.area.y, new_fork.area.width / 2, new_fork.area.height])
                        : new Rect.Rectangle([new_fork.area.x, new_fork.area.y, new_fork.area.width, new_fork.area.height / 2]);

                    if (inner_left.contains(cursor)) {
                        const temp = new_fork.left;
                        new_fork.left = new_fork.right as Node.Node;
                        new_fork.right = temp;
                    }

                    fork.left = Node.Node.fork(fork_entity);
                    this.parents.insert(fork_entity, entity);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, [fork_entity, new_fork]);
                } else {
                    fork.right = right_node;
                    fork.set_ratio(fork.length() / 2);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, null);
                }
            } else if (fork.right && fork.right.is_window(onto_entity)) {
                const area = fork.area_of_right(ext);
                const [fork_entity, new_fork] = this.create_fork(fork.right, right_node, area, fork.workspace);

                const inner_left = new_fork.is_horizontal()
                    ? new Rect.Rectangle([new_fork.area.x, new_fork.area.y, new_fork.area.width / 2, new_fork.area.height])
                    : new Rect.Rectangle([new_fork.area.x, new_fork.area.y, new_fork.area.width, new_fork.area.height / 2]);

                if (inner_left.contains(cursor)) {
                    const temp = new_fork.left;
                    new_fork.left = new_fork.right as Node.Node;
                    new_fork.right = temp;
                }

                fork.right = Node.Node.fork(fork_entity);
                this.parents.insert(fork_entity, entity);
                return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, [fork_entity, new_fork]);
            }
        }

        return null;
    }

    /** Assigns the callback to trigger when a window is attached to a fork */
    connect_on_attach(callback: (parent: Entity, child: Entity) => void): this {
        this.on_attach = callback;
        return this;
    }

    /** Creates a new fork entity in the world */
    create_entity(): Entity {
        const entity = super.create_entity();
        this.string_reps.insert(entity, `${entity}`);
        return entity;
    }

    /** Create a new fork, where the left portion is a window `Entity` */
    create_fork(
        left: Node.Node,
        right: Node.Node | null,
        area: Rectangle,
        workspace: number
    ): [Entity, Fork.Fork] {
        const entity = this.create_entity();
        let orient = area.width > area.height ? Lib.Orientation.HORIZONTAL : Lib.Orientation.VERTICAL;
        let fork = new Fork.Fork(entity, left, right, area, workspace, orient);

        this.forks.insert(entity, fork);
        return [entity, fork];
    }

    /** Create a new top level fork */
    create_toplevel(
        window: Entity,
        area: Rectangle,
        id: [number, number]
    ): [Entity, Fork.Fork] {
        const [entity, fork] = this.create_fork(
            Node.Node.window(window), null, area, id[1]
        );

        this.string_reps.with(entity, (sid) => {
            fork.set_toplevel(this, entity, sid, id);
        });

        return [entity, fork];
    }

    /** Deletes a fork entity from the world, performing any cleanup necessary */
    delete_entity(entity: Entity) {
        const fork = this.forks.remove(entity);
        if (fork && fork.is_toplevel) {
            const id = this.string_reps.get(entity);
            if (id) this.toplevel.delete(id);
        }

        super.delete_entity(entity);
    }

    /** Detaches an entity from the a fork, re-arranging the fork's tree as necessary */
    detach(fork_entity: Entity, window: Entity): [Entity, Fork.Fork] | null {
        const fork = this.forks.get(fork_entity);
        if (!fork) return null;

        let reflow_fork: [Entity, Fork.Fork] | null = null;

        const parent = this.parents.get(fork_entity);
        if (fork.left.is_window(window)) {
            if (parent && fork.right) {
                const pfork = this.reassign_child_to_parent(fork_entity, parent, fork.right);
                if (!pfork) return null;
                reflow_fork = [parent, pfork];
            } else if (fork.right) {
                reflow_fork = [fork_entity, fork];
                if (fork.right.kind == Node.NodeKind.WINDOW) {
                    const detached = fork.right;
                    fork.left = detached;
                    fork.right = null;
                } else {
                    this.reassign_children_to_parent(fork_entity, fork.right.entity, fork);
                }
            } else {
                this.delete_entity(fork_entity);
            }
        } else if (fork.right && fork.right.is_window(window)) {
            // Same as the `fork.left` branch.
            if (parent) {
                const pfork = this.reassign_child_to_parent(fork_entity, parent, fork.left);
                if (!pfork) return null;
                reflow_fork = [parent, pfork];
            } else {
                reflow_fork = [fork_entity, fork];

                if (fork.left.kind == Node.NodeKind.FORK) {
                    this.reassign_children_to_parent(fork_entity, fork.left.entity, fork);
                } else {
                    fork.right = null;
                }
            }
        }

        if (reflow_fork) {
            reflow_fork[1].rebalance_orientation();
        }

        return reflow_fork;
    }

    /** Creates a string representation of every fork in the world */
    fmt(ext: Ext) {
        let fmt = '';

        for (const [entity,] of this.toplevel.values()) {
            const fork = this.forks.get(entity);

            fmt += ' ';
            if (fork) {
                fmt += this.display_fork(ext, entity, fork, 1) + '\n';
            } else {
                fmt += `Fork(${entity}) Invalid\n`;
            }
        }

        return fmt;
    }

    /** Finds the top level fork associated with the given entity. */
    find_toplevel(id: [number, number]): Entity | null {
        for (const [entity, [mon, work]] of this.toplevel.values()) {
            if (mon == id[0] && work == id[1]) {
                Log.log(`found top level at Fork(${entity})`);
                return entity;
            }
        }

        return null;
    }

    /** Grows a sibling a fork. */
    private grow_sibling(
        ext: Ext,
        fork_e: Entity,
        fork_c: Fork.Fork,
        is_left: boolean,
        movement: movement.Movement,
        crect: Rectangle,
    ) {
        if (fork_c.is_horizontal()) {
            if ((movement & (Movement.DOWN | Movement.UP)) != 0) {
                this.resize_fork_(ext, fork_e, crect);
            } else if (is_left) {
                if ((movement & Movement.RIGHT) != 0) {
                    this.readjust_fork_ratio_by_left(ext, crect.width, fork_c);
                } else {
                    this.resize_fork_(ext, fork_e, crect);
                }
            } else if ((movement & Movement.RIGHT) != 0) {
                this.resize_fork_(ext, fork_e, crect);
            } else {
                this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area.width);
            }
        } else {
            if ((movement & (Movement.LEFT | Movement.RIGHT)) != 0) {
                this.resize_fork_(ext, fork_e, crect);
            } else if (is_left) {
                if ((movement & Movement.DOWN) != 0) {
                    this.readjust_fork_ratio_by_left(ext, crect.height, fork_c);
                } else {
                    this.resize_fork_(ext, fork_e, crect);
                }
            } else if ((movement & Movement.DOWN) != 0) {
                this.resize_fork_(ext, fork_e, crect);
            } else {
                this.readjust_fork_ratio_by_right(ext, crect.height, fork_c, fork_c.area.height);
            }
        }
    }

    /** Walks the tree starting at a given fork entity, and filtering by node kind. */
    * iter(entity: Entity, kind: Node.NodeKind | null = null): IterableIterator<Node.Node> {
        let fork = this.forks.get(entity);
        let forks = new Array(2);

        while (fork) {
            if (fork.left.kind == Node.NodeKind.FORK) {
                forks.push(this.forks.get(fork.left.entity));
            }

            if (kind === null || fork.left.kind == kind) {
                yield fork.left
            }

            if (fork.right) {
                if (fork.right.kind == Node.NodeKind.FORK) {
                    forks.push(this.forks.get(fork.right.entity));
                }

                if (kind === null || fork.right.kind == kind) {
                    yield fork.right;
                }
            }

            fork = forks.pop();
        }
    }

    /** Finds the largest window on a monitor + workspace. */
    largest_window_on(ext: Ext, entity: Entity): ShellWindow | null {
        let largest_window = null;
        let largest_size = 0;

        for (const win of this.iter(entity, Node.NodeKind.WINDOW)) {
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

    /** Resize a window from a given fork based on a supplied movement. */
    resize(ext: Ext, fork_e: Entity, fork_c: Fork.Fork, win_e: Entity, movement: movement.Movement, crect: Rectangle) {
        const is_left = fork_c.left.is_window(win_e);

        ((movement & Movement.SHRINK) != 0 ? this.shrink_sibling : this.grow_sibling)
            .call(this, ext, fork_e, fork_c, is_left, movement, crect);
    }

    /** Higher order function which forwards record events to our record method. */
    on_record(): (entity: Entity, parent: Entity, rect: Rectangle) => void {
        return (e, p, a) => this.record(e, p, a);
    }

    /** Records window movements which have been queued. */
    private record(entity: Entity, parent: Entity, rect: Rectangle) {
        this.requested.set(entity, {
            parent: parent,
            rect: rect,
        });
    }

    /**
     * Reassigns the child of a fork to the parent
     */
    private reassign_child_to_parent(child_entity: Entity, parent_entity: Entity, branch: Node.Node): Fork.Fork | null {
        const parent = this.forks.get(parent_entity);

        if (parent) {
            if (parent.left.is_fork(child_entity)) {
                parent.left = branch;
            } else {
                parent.right = branch;
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
    private reassign_sibling(sibling: Node.Node, parent: Entity) {
        (sibling.kind == Node.NodeKind.FORK ? this.reassign_parent : this.on_attach)
            .call(this, parent, sibling.entity);
    }

    /**
     * Reassigns children of the child entity to the parent entity
     *
     * Each fork has a left and optional right child entity
     */
    private reassign_children_to_parent(parent_entity: Entity, child_entity: Entity, p_fork: Fork.Fork) {
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

    /** Reassigns a child to the given parent */
    private reassign_parent(parent: Entity, child: Entity) {
        this.parents.insert(child, parent);
    }

    /** Readjusts the division of space between the left and right siblings of a fork */
    private readjust_fork_ratio_by_left(
        ext: Ext,
        left_length: number,
        fork: Fork.Fork,
    ) {
        fork.set_ratio(left_length).measure(this, ext, fork.area, this.on_record())
    }

    /** Readjusts the division of space between the left and right siblings of a fork
     *
     * Determines the size of the left sibling based on the new length of the right sibling
     */
    private readjust_fork_ratio_by_right(ext: Ext,
        right_length: number,
        fork: Fork.Fork,
        fork_length: number,
    ) {
        this.readjust_fork_ratio_by_left(ext, fork_length - right_length, fork);
    }

    /** Resizes a fork in the direction that a movement requests */
    private resize_fork_(ext: Ext, child_e: Entity, crect: Rectangle, shrunk?: movement.Movement) {
        let parent = this.parents.get(child_e),
            child: Fork.Fork = this.forks.get(child_e) as Fork.Fork;

        if (!parent) {
            child.measure(this, ext, child.area, this.on_record());
            return;
        }

        let is_left: boolean = child.left.is_fork(child_e),
            length: number;

        if (shrunk) {
            let origin;
            switch (shrunk) {
                case Movement.DOWN:
                    origin = child.area.y;
                    break
                case Movement.UP:
                    origin = child.area.y + child.area.height;
                    break
                case Movement.LEFT:
                    origin = child.area.x;
                    break
                default:
                    origin = child.area.x + child.area.width;
            }

            outer: while (parent !== null) {
                child = this.forks.get(parent) as Fork.Fork;
                is_left = child.left.is_fork(child_e);

                switch (shrunk) {
                    case Movement.DOWN:
                        if (origin > child.area.y) break outer;
                        break
                    case Movement.UP:
                        if (origin < child.area.y + child.area.height) break outer;
                        break
                    case Movement.LEFT:
                        if (origin > child.area.x) break outer;
                        break
                    default:
                        if (origin < child.area.x + child.area.width) break outer;
                }

                child_e = parent;
                parent = this.parents.get(child_e);
            }
        } else {
            while (parent !== null) {
                child = this.forks.get(parent) as Fork.Fork;
                is_left = child.left.is_fork(child_e);

                if (child.area.contains(crect)) {
                    break
                }

                child_e = parent;
                parent = this.parents.get(child_e);
            }
        }

        if (child.is_horizontal()) {
            length = is_left
                ? crect.x + crect.width - child.area.x
                : crect.x - child.area.x
        } else {
            length = is_left
                ? crect.y + crect.height - child.area.y
                : child.area.height - crect.height
        }

        child.set_ratio(length);

        child.measure(this, ext, child.area, this.on_record());
    }

    /** Shrinks the sibling of a fork, possibly shrinking the fork itself */
    private shrink_sibling(
        ext: Ext,
        fork_e: Entity,
        fork_c: Fork.Fork,
        is_left: boolean,
        movement: movement.Movement,
        crect: Rectangle,
    ) {
        if (fork_c.area) {
            if (fork_c.is_horizontal()) {
                if ((movement & (Movement.DOWN | Movement.UP)) != 0) {
                    this.resize_fork_(ext, fork_e, crect);
                } else if (is_left) {
                    if ((movement & Movement.LEFT) != 0) {
                        this.readjust_fork_ratio_by_left(ext, crect.width, fork_c);
                    } else {
                        this.resize_fork_(ext, fork_e, crect, movement);
                    }
                } else if ((movement & Movement.LEFT) != 0) {
                    this.resize_fork_(ext, fork_e, crect, movement);
                } else {
                    this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area.array[2]);
                }
            } else {
                if ((movement & (Movement.LEFT | Movement.RIGHT)) != 0) {
                    this.resize_fork_(ext, fork_e, crect, movement);
                } else if (is_left) {
                    if ((movement & Movement.UP) != 0) {
                        this.readjust_fork_ratio_by_left(ext, crect.height, fork_c);
                    } else {
                        this.resize_fork_(ext, fork_e, crect, movement);
                    }
                } else if ((movement & Movement.UP) != 0) {
                    this.resize_fork_(ext, fork_e, crect, movement);
                } else {
                    this.readjust_fork_ratio_by_right(ext, crect.height, fork_c, fork_c.area.array[3]);
                }
            }
        }
    }

    private _attach(
        onto_entity: Entity,
        new_entity: Entity,
        assoc: (a: Entity, b: Entity) => void,
        entity: Entity,
        fork: Fork.Fork,
        result: [Entity, Fork.Fork] | null
    ): [Entity, Fork.Fork] | null {
        if (result) {
            assoc(result[0], onto_entity);
            assoc(result[0], new_entity);
        } else {
            assoc(entity, new_entity);
        }

        return [entity, fork];
    }

    private display_branch(ext: Ext, branch: Node.Node, scope: number): string {
        if (branch.kind == Node.NodeKind.WINDOW) {
            const window = ext.windows.get(branch.entity);
            return `Window(${branch.entity}) (${window ? window.rect().fmt() : "unknown area"})`;
        } else {
            const fork = this.forks.get(branch.entity);
            return fork ? this.display_fork(ext, branch.entity, fork, scope + 1) : "Missing Fork";
        }
    }

    private display_fork(ext: Ext, entity: Entity, fork: Fork.Fork, scope: number): string {
        let fmt = `Fork(${entity}) [${fork.area ? fork.area.array : "unknown"}]: {\n`;

        fmt += ' '.repeat((1 + scope) * 2) + `workspace: (${fork.workspace}),\n`;
        fmt += ' '.repeat((1 + scope) * 2) + 'left:  ' + this.display_branch(ext, fork.left, scope) + ',\n';

        if (fork.right) {
            fmt += ' '.repeat((1 + scope) * 2) + 'right: ' + this.display_branch(ext, fork.right, scope) + ',\n';
        }

        fmt += ' '.repeat(scope * 2) + '}';
        return fmt;
    }
}


function move_window(ext: Ext, window: ShellWindow, rect: Rectangular, on_complete: () => void) {
    if (!(window.meta instanceof Meta.Window)) {
        Log.error(`attempting to a window entity in a tree which lacks a Meta.Window`);
        return;
    }

    const actor = window.meta.get_compositor_private();

    if (!actor) {
        Log.warn(`Window(${window.meta.get_title()}) does not have an actor, and therefore cannot be moved`);
        return;
    }

    ext.size_signals_block(window);

    window.move(ext, rect, () => {
        on_complete();
        ext.size_signals_unblock(window);
    });
}
