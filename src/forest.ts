// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as arena from 'arena';
import * as Ecs from 'ecs';
import * as Lib from 'lib';
import * as log from 'log';
import * as movement from 'movement';
import * as Rect from 'rectangle';
import * as Node from 'node';
import * as Fork from 'fork';
import * as geom from 'geom';

import type { Entity } from 'ecs';
import type { Rectangle } from './rectangle';
import type { ShellWindow } from './window';
import type { Ext } from './extension';
import { Stack } from './stack';

const { Arena } = arena;
const { Meta } = imports.gi;
const { Movement } = movement;

const { DOWN, UP, LEFT, RIGHT } = Movement

export interface MoveByCursor {
    orientation: Lib.Orientation,
    swap: boolean
}

export interface MoveByKeyboard {
    src: Rectangular
}

export interface MoveByAuto {
    auto: number
}

export type MoveBy = MoveByCursor | MoveByKeyboard | MoveByAuto

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

    /** Stores stacks which must have their containers redrawn */
    stack_updates: Array<[Node.NodeStack, Entity]> = new Array();

    /** The storage for holding all fork associations. */
    forks: Ecs.Storage<Fork.Fork> = this.register_storage();

    /** Child-parent associations are stored here. */
    parents: Ecs.Storage<Entity> = this.register_storage();

    /** Needed when we're storing the entities in a map, because JS limitations. */
    string_reps: Ecs.Storage<string> = this.register_storage();

    stacks: arena.Arena<Stack> = new Arena();

    /** The callback to execute when a window has been attached to a fork. */
    on_attach: (parent: Entity, child: Entity) => void = () => { };

    /** Likewise for detachments */
    on_detach: (child: Entity) => void = () => { };

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
    arrange(ext: Ext, _workspace: number, _ignore_reset: boolean = false) {
        for (const [entity, r] of this.requested) {
            const window = ext.windows.get(entity);
            if (!window) continue;

            let on_complete = () => {
                if (!window.actor_exists()) return
            }

            if (ext.tiler.window) {
                if (Ecs.entity_eq(ext.tiler.window, entity)) {
                    on_complete = () => {
                        ext.set_overlay(window.rect());

                        if (!window.actor_exists()) return
                    }
                }
            }

            move_window(ext, window, r.rect, on_complete);
        }

        this.requested.clear();

        for (const [stack,] of this.stack_updates.splice(0)) {
            ext.auto_tiler?.update_stack(ext, stack);
        }
    }

    attach_fork(ext: Ext, fork: Fork.Fork, window: Entity, is_left: boolean) {
        const node = Node.Node.window(window);

        if (is_left) {
            if (fork.right) {
                const new_fork = this.create_fork(fork.left, fork.right, fork.area_of_right(ext), fork.workspace, fork.monitor)[0];
                fork.right = Node.Node.fork(new_fork);
                this.parents.insert(new_fork, fork.entity);
                this.on_attach(new_fork, window);
            } else {
                this.on_attach(fork.entity, window);
                fork.right = fork.left;
            }

            fork.left = node;
        } else {
            if (fork.right) {
                const new_fork = this.create_fork(fork.left, fork.right, fork.area_of_left(ext), fork.workspace, fork.monitor)[0];
                fork.left = Node.Node.fork(new_fork);
                this.parents.insert(new_fork, fork.entity);
                this.on_attach(new_fork, window);
            } else {
                this.on_attach(fork.entity, window)
            }

            fork.right = node;
        }

        this.on_attach(fork.entity, window);
    }

    attach_stack(ext: Ext, stack: Node.NodeStack, fork: Fork.Fork, new_entity: Entity, stack_from_left: boolean): [Entity, Fork.Fork] | null {
        const container = this.stacks.get(stack.idx);
        if (container) {
            const window = ext.windows.get(new_entity);
            if (window) {
                window.stack = stack.idx;

                if (stack_from_left) {
                    stack.entities.push(new_entity);
                } else {
                    stack.entities.unshift(new_entity);
                }

                this.on_attach(fork.entity, new_entity);

                ext.auto_tiler?.update_stack(ext, stack);

                if (window.meta.has_focus()) {
                    container.activate(new_entity);
                }

                return [fork.entity, fork];
            } else {
                log.warn('attempted to attach window to stack that does not exist');
            }
        } else {
            log.warn('attempted to attach to stack that does not exist');
        }

        return null;
    }

    /** Attaches a `new` window to the fork which `onto` is attached to. */
    attach_window(ext: Ext, onto_entity: Entity, new_entity: Entity, place_by: MoveBy, stack_from_left: boolean): [Entity, Fork.Fork] | null {
        /** Place a window in a fork based on where the window was originally located */
        function place_by_keyboard(fork: Fork.Fork, src: Rectangular, left: Rectangle, right: Rectangle) {
            const from : [number, number] = [src.x + (src.width / 2), src.y + (src.height / 2)]

            const lside = geom.shortest_side(from, left)
            const rside = geom.shortest_side(from, right)

            if (lside < rside) fork.swap_branches()
        }

        /** By default, new attachments are positioned on the left of a branch */
        function place(place_by: MoveBy, fork: Fork.Fork, left: Rectangle, right: Rectangle) {
            if ("swap" in place_by) {
                const { orientation, swap } = place_by
                fork.set_orientation(orientation)
                if (swap) fork.swap_branches()
            } else if ("src" in place_by) {
                place_by_keyboard(fork, place_by.src, left, right)
            }
        }

        /** Fetch two rectangles representing the inner left and right halves of a fork
         *
         * In the case of a vertical fork, the left and right halves are the top and bottom
         */
        function area_of_halves(fork: Fork.Fork): [Rectangle, Rectangle] {
            const { x, y, width, height } = fork.area

            const [left, right]: [[number, number, number, number], [number, number, number, number]] = fork.is_horizontal()
                ? [[x, y, width / 2, height], [x + (width / 2), y, width / 2, height]]
                : [[x, y, width, height / 2], [x, y + (height / 2), width, height / 2]]

            return [new Rect.Rectangle(left), new Rect.Rectangle(right)]
        }

        /** Create a fork and place this new fork on the left branch */
        const fork_and_place_on_left = (entity: Entity, fork: Fork.Fork): [Entity, Fork.Fork] | null => {
            const area = fork.area_of_left(ext)

            const [fork_entity, new_fork] = this.create_fork(fork.left, right_node, area, fork.workspace, fork.monitor)

            fork.left = Node.Node.fork(fork_entity)
            this.parents.insert(fork_entity, entity)

            const [left, right] = area_of_halves(new_fork)
            place(place_by, new_fork, left, right)

            return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, [fork_entity, new_fork])
        }

        /** Create a new fork and place this new fork on the right branch */
        const fork_and_place_on_right = (entity: Entity, fork: Fork.Fork, right_branch: Node.Node): [Entity, Fork.Fork] | null => {
            const area = fork.area_of_right(ext)
            const [fork_entity, new_fork] = this.create_fork(right_branch, right_node, area, fork.workspace, fork.monitor)

            fork.right = Node.Node.fork(fork_entity)
            this.parents.insert(fork_entity, entity)

            const [left, right] = area_of_halves(new_fork)
            place(place_by, new_fork, left, right)

            return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, [fork_entity, new_fork]);
        }

        const right_node = Node.Node.window(new_entity)

        for (const [entity, fork] of this.forks.iter()) {
            if (fork.left.is_window(onto_entity)) {
                if (fork.right) {
                    return fork_and_place_on_left(entity, fork)
                } else {
                    fork.right = right_node;
                    fork.set_ratio(fork.length() / 2);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, null);
                }
            } else if (fork.left.is_in_stack(onto_entity)) {
                const stack = fork.left.inner as Node.NodeStack;
                return this.attach_stack(ext, stack, fork, new_entity, stack_from_left);
            } else if (fork.right) {
                if (fork.right.is_window(onto_entity)) {
                    return fork_and_place_on_right(entity, fork, fork.right)
                } else if (fork.right.is_in_stack(onto_entity)) {
                    const stack = fork.right.inner as Node.NodeStack;
                    return this.attach_stack(ext, stack, fork, new_entity, stack_from_left);
                }
            }
        }

        return null;
    }

    /** Assigns the callback to trigger when a window is attached to a fork */
    connect_on_attach(callback: (parent: Entity, child: Entity) => void): this {
        this.on_attach = callback;
        return this;
    }

    connect_on_detach(callback: (child: Entity) => void): this {
        this.on_detach = callback;
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
        workspace: WorkspaceID,
        monitor: MonitorID,
    ): [Entity, Fork.Fork] {
        const entity = this.create_entity();
        let orient = area.width > area.height ? Lib.Orientation.HORIZONTAL : Lib.Orientation.VERTICAL;
        let fork = new Fork.Fork(entity, left, right, area, workspace, monitor, orient);
        this.forks.insert(entity, fork);
        return [entity, fork];
    }

    /** Create a new top level fork */
    create_toplevel(
        window: Entity,
        area: Rectangle,
        id: [MonitorID, WorkspaceID]
    ): [Entity, Fork.Fork] {
        const [entity, fork] = this.create_fork(
            Node.Node.window(window), null, area, id[1], id[0]
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
    detach(ext: Ext, fork_entity: Entity, window: Entity, destroy_stack: boolean = false): [Entity, Fork.Fork] | null {
        const fork = this.forks.get(fork_entity);
        if (!fork) return null;

        // The fork which has been modified, and requires rebalancing
        let reflow_fork: [Entity, Fork.Fork] | null = null,
            // Stack detachments, however, need not rebalance the fork
            stack_detach = false;

        const parent = this.parents.get(fork_entity);
        if (fork.left.is_window(window)) {
            if (parent && fork.right) {
                const pfork = this.reassign_child_to_parent(fork_entity, parent, fork.right);
                if (!pfork) return null;
                reflow_fork = [parent, pfork];
            } else if (fork.right) {
                reflow_fork = [fork_entity, fork];
                switch (fork.right.inner.kind) {
                    case 1:
                        this.reassign_children_to_parent(fork_entity, (fork.right.inner as Node.NodeFork).entity, fork);
                        break
                    default:
                        const detached = fork.right;
                        fork.left = detached;
                        fork.right = null;
                }
            } else {
                this.delete_entity(fork_entity);
            }
        } else if (fork.left.is_in_stack(window)) {
            reflow_fork = [fork_entity, fork];
            stack_detach = true;

            this.remove_from_stack(
                ext,
                fork.left.inner as Node.NodeStack,
                window,
                destroy_stack,
                (window: undefined | Entity) => {
                    if (window) {
                        fork.left = Node.Node.window(window)
                    } else if (fork.right) {
                        fork.left = fork.right
                        fork.right = null
                        if (parent) {
                            const pfork = this.reassign_child_to_parent(fork_entity, parent, fork.left);
                            if (!pfork) return null;
                            reflow_fork = [parent, pfork];
                        }
                    } else {
                        this.delete_entity(fork.entity);
                    }
                }
            );
        } else if (fork.right) {
            if (fork.right.is_window(window)) {
                // Same as the `fork.left` branch.
                if (parent) {
                    const pfork = this.reassign_child_to_parent(fork_entity, parent, fork.left);
                    if (!pfork) return null;
                    reflow_fork = [parent, pfork];
                } else {
                    reflow_fork = [fork_entity, fork];

                    switch (fork.left.inner.kind) {
                        case 1:
                            this.reassign_children_to_parent(fork_entity, fork.left.inner.entity, fork);
                            break
                        default:
                            fork.right = null;
                            break
                    }
                }
            } else if (fork.right.is_in_stack(window)) {
                reflow_fork = [fork_entity, fork];
                stack_detach = true;

                this.remove_from_stack(
                    ext,
                    fork.right.inner as Node.NodeStack,
                    window,
                    destroy_stack,
                    (window) => {
                        if (window) {
                            fork.right = Node.Node.window(window)
                        } else {
                            fork.right = null
                            this.reassign_to_parent(fork, fork.left)
                        }

                    },
                );
            }
        }

        if (stack_detach) {
            ext.windows.with(window, w => w.stack = null)
        }

        this.on_detach(window);

        if (reflow_fork && !stack_detach) {
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
    find_toplevel([src_mon, src_work]: [number, number]): Entity | null {
        for (const [entity, fork] of this.forks.iter()) {
            if (!fork.is_toplevel) continue
            const { monitor, workspace } = fork
            if (monitor == src_mon && workspace == src_work) {
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
        const resize_fork = () => this.resize_fork_(ext, fork_e, crect, movement, false);

        if (fork_c.is_horizontal()) {
            if ((movement & (DOWN | UP)) != 0) {
                resize_fork();
            } else if (is_left) {
                if ((movement & RIGHT) != 0) {
                    this.readjust_fork_ratio_by_left(ext, crect.width, fork_c);
                } else {
                    resize_fork();
                }
            } else if ((movement & RIGHT) != 0) {
                resize_fork();
            } else {
                this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area.width);
            }
        } else {
            if ((movement & (LEFT | RIGHT)) != 0) {
                resize_fork();
            } else if (is_left) {
                if ((movement & DOWN) != 0) {
                    this.readjust_fork_ratio_by_left(ext, crect.height, fork_c);
                } else {
                    resize_fork();
                }
            } else if ((movement & DOWN) != 0) {
                resize_fork();
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
            if (fork.left.inner.kind === 1) {
                forks.push(this.forks.get(fork.left.inner.entity));
            }

            if (kind === null || fork.left.inner.kind === kind) {
                yield fork.left
            }

            if (fork.right) {
                if (fork.right.inner.kind === 1) {
                    forks.push(this.forks.get(fork.right.inner.entity));
                }

                if (kind === null || fork.right.inner.kind == kind) {
                    yield fork.right;
                }
            }

            fork = forks.pop();
        }
    }

    /** Finds the largest tilable window on a monitor + workspace. */
    largest_window_on(ext: Ext, entity: Entity): ShellWindow | null {
        let largest_window = null;
        let largest_size = 0;

        let window_compare = (entity: Entity) => {
            const window = ext.windows.get(entity);
            if (window && window.is_tilable(ext)) {
                const rect = window.rect();
                const size = rect.width * rect.height;
                if (size > largest_size) {
                    largest_size = size;
                    largest_window = window;
                }
            }
        };

        for (const node of this.iter(entity)) {
            switch (node.inner.kind) {
                case 2:
                    window_compare(node.inner.entity);
                    break
                case 3:
                    window_compare(node.inner.entities[0]);
            }
        }

        return largest_window;
    }

    /** Resize a window from a given fork based on a supplied movement. */
    resize(ext: Ext, fork_e: Entity, fork_c: Fork.Fork, win_e: Entity, movement: movement.Movement, crect: Rectangle) {
        const is_left = fork_c.left.is_window(win_e) || fork_c.left.is_in_stack(win_e);

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

    reassign_to_parent(child: Fork.Fork, reassign: Node.Node) {
        const p = this.parents.get(child.entity);
        if (p) {
            const p_fork = this.forks.get(p);
            if (p_fork) {
                if (p_fork.left.is_fork(child.entity)) {
                    p_fork.left = reassign;
                } else {
                    p_fork.right = reassign;
                }

                const inner = reassign.inner;

                switch (inner.kind) {
                    case 1:
                        this.parents.insert(inner.entity, p)
                        break
                    case 2:
                        this.on_attach(p, inner.entity);
                        break
                    case 3:
                        for (const entity of inner.entities) this.on_attach(p, entity)
                }
            }

            this.delete_entity(child.entity);
        }
    }

    /**
     * Reassigns a sibling based on whether it is a fork or a window.
     *
     * - If the sibling is a fork, reassign the parent.
     * - If it is a window, simply call on_attach
     */
    private reassign_sibling(sibling: Node.Node, parent: Entity) {
        switch (sibling.inner.kind) {
            case 1:
                this.parents.insert(sibling.inner.entity, parent);
                break;
            case 2:
                this.on_attach(parent, sibling.inner.entity);
                break;
            case 3:
                for (const entity of sibling.inner.entities) {
                    this.on_attach(parent, entity);
                }
        }
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
            log.error(`Fork(${child_entity}) does not exist`);
        }
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

    /** Removes window from stack, destroying the stack if it was the last window. */
    private remove_from_stack(ext: Ext, stack: Node.NodeStack, window: Entity, destroy_stack: boolean, on_last: (win?: Entity) => void) {
        if (stack.entities.length === 1) {
            this.stacks.remove(stack.idx)?.destroy();
            on_last();
        } else {
            const idx = Node.stack_remove(this, stack, window);

            // Activate the next window in the stack if the window was destroyed.
            if (idx !== null && idx > 0) {
                const focused = ext.focus_window();
                if (focused && !focused.meta.get_compositor_private() && Ecs.entity_eq(window, focused.entity)) {
                    ext.windows.get(stack.entities[idx - 1])?.activate();
                }
            }

            if (destroy_stack && stack.entities.length === 1) {
                on_last(stack.entities[0])
                this.stacks.remove(stack.idx)?.destroy()
            }
        }

        const win = ext.windows.get(window);
        if (win) {
            win.stack = null;
        }
    }

    /** Resizes a fork in the direction that a movement requests */
    private resize_fork_(ext: Ext, child_e: Entity, crect: Rectangle, mov: movement.Movement, shrunk: boolean) {
        let parent = this.parents.get(child_e),
            child: Fork.Fork = this.forks.get(child_e) as Fork.Fork;

        if (!parent) {
            child.measure(this, ext, child.area, this.on_record());
            return;
        }

        const src_node = this.forks.get(child_e);
        if (!src_node) return;

        let is_left: boolean = child.left.is_fork(child_e),
            length: number;

        while (parent !== null) {
            child = this.forks.get(parent) as Fork.Fork;
            is_left = child.left.is_fork(child_e);

            if (child.area.contains(crect)) {
                if ((mov & UP) !== 0) {
                    if (shrunk) {
                        if (child.area.y + child.area.height > src_node.area.y + src_node.area.height) {
                            break
                        }
                    } else if (!child.is_horizontal() || !is_left) {
                        break
                    }
                } else if ((mov & DOWN) !== 0) {
                    if (shrunk) {
                        if (child.area.y < src_node.area.y) {
                            break
                        }
                    } else if (child.is_horizontal() || is_left) {
                        break
                    }
                } else if ((mov & LEFT) !== 0) {
                    if (shrunk) {
                        if (child.area.x + child.area.width > src_node.area.x + src_node.area.width) {
                            break
                        }
                    } else if (!child.is_horizontal() || !is_left) {
                        break
                    }
                } else if ((mov & RIGHT) !== 0) {
                    if (shrunk) {
                        if (child.area.x < src_node.area.x) {
                            break
                        }
                    } else if (!child.is_horizontal() || is_left) {
                        break
                    }
                }
            }

            child_e = parent;
            parent = this.parents.get(child_e);
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
        const resize_fork = () => this.resize_fork_(ext, fork_e, crect, movement, true);

        if (fork_c.area) {
            if (fork_c.is_horizontal()) {
                if ((movement & (DOWN | UP)) != 0) {
                    resize_fork();
                } else if (is_left) {
                    if ((movement & LEFT) != 0) {
                        this.readjust_fork_ratio_by_left(ext, crect.width, fork_c);
                    } else {
                        resize_fork();
                    }
                } else if ((movement & LEFT) != 0) {
                    resize_fork();
                } else {
                    this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area.array[2]);
                }
            } else {
                if ((movement & (LEFT | RIGHT)) != 0) {
                    resize_fork();
                } else if (is_left) {
                    if ((movement & UP) != 0) {
                        this.readjust_fork_ratio_by_left(ext, crect.height, fork_c);
                    } else {
                        resize_fork();
                    }
                } else if ((movement & UP) != 0) {
                    resize_fork();
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
        switch (branch.inner.kind) {
            case 1:
                const fork = this.forks.get(branch.inner.entity);
                return fork ? this.display_fork(ext, branch.inner.entity, fork, scope + 1) : "Missing Fork";
            case 2:
                const window = ext.windows.get(branch.inner.entity);
                return `Window(${branch.inner.entity}) (${window ? window.rect().fmt() : "unknown area"}; parent: ${ext.auto_tiler?.attached.get(branch.inner.entity)})`;
            case 3:
                let fmt = 'Stack(';

                for (const entity of branch.inner.entities) {
                    const window = ext.windows.get(entity);
                    fmt += `Window(${entity}) (${window ? window.rect().fmt() : "unknown area"}), `;
                }

                return fmt + ')';
        }
    }

    display_fork(ext: Ext, entity: Entity, fork: Fork.Fork, scope: number): string {
        let fmt = `Fork(${entity}) [${fork.area ? fork.area.array : "unknown"}]: {\n`;

        fmt += ' '.repeat((1 + scope) * 2) + `workspace: (${fork.workspace}),\n`;
        fmt += ' '.repeat((1 + scope) * 2) + 'left: ' + this.display_branch(ext, fork.left, scope) + ',\n';
        fmt += ' '.repeat((1 + scope) * 2) + 'parent: ' + this.parents.get(fork.entity) + ',\n';

        if (fork.right) {
            fmt += ' '.repeat((1 + scope) * 2) + 'right: ' + this.display_branch(ext, fork.right, scope) + ',\n';
        }

        fmt += ' '.repeat(scope * 2) + '}';
        return fmt;
    }
}


function move_window(ext: Ext, window: ShellWindow, rect: Rectangular, on_complete: () => void) {
    if (!(window.meta instanceof Meta.Window)) {
        log.error(`attempting to a window entity in a tree which lacks a Meta.Window`);
        return;
    }

    const actor = window.meta.get_compositor_private();

    if (!actor) {
        log.warn(`Window(${window.entity}) does not have an actor, and therefore cannot be moved`);
        return;
    }

    ext.size_signals_block(window);
    window.move(ext, rect, () => {
        on_complete();
        ext.size_signals_unblock(window);
    }, false);
}
