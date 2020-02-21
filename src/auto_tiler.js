const Me = imports.misc.extensionUtils.getCurrentExtension();

const { entity_eq, Storage, World } = Me.imports.ecs;
const Lib = Me.imports.lib;
const { ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL, orientation_as_str } = Lib;
const Log = Me.imports.log;

var FORK = 0;
var WINDOW = 1;

const XPOS = 0;
const YPOS = 1;
const WIDTH = 2;
const HEIGHT = 3;

/**
 * The world containing all forks and their attached windows, which is responible for
 * handling all automatic tiling and reflowing as windows are moved, closed, and resized
 *
 * @param {Map} toplevel A map containing all of the top level forks in this world
 * @param {Storage} string_reps A storage containing a string representation of fork entities
 * @param {Storage} forks A storage containing all of the forks in the world
 * @param {function} on_attach A callback that is triggered whenever a window is attached to a fork
 */
var AutoTiler = class AutoTiler extends World {
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
     *
     * @param {Entity} onto_entity
     * @param {Entity} new_entity
     */
    attach_window(onto_entity, new_entity) {
        Log.debug(`attaching Window(${new_entity}) onto Window(${onto_entity})`);

        for (const [entity, fork] of this.forks.iter()) {
            if (fork.left.is_window(onto_entity)) {
                const node = TilingNode.window(new_entity);
                if (fork.right) {
                    const result = this.create_fork(fork.left, node);
                    fork.left = TilingNode.fork(result[0]);
                    Log.debug(`attached Fork(${result[0]}) to Fork(${entity}).left`);
                    result[1].set_parent(entity);
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, result);
                } else {
                    fork.right = node;
                    return this._attach(onto_entity, new_entity, this.on_attach, entity, fork, null);
                }
            } else if (fork.right && fork.right.is_window(onto_entity)) {
                const result = this.create_fork(fork.right, TilingNode.window(new_entity));
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
     *
     * @param {function} callback
     * @return Self
     */
    connect_on_attach(callback) {
        this.on_attach = callback;
        return this;
    }

    /**
     * Creates a new fork entity in the world
     *
     * @return Entity
     */
    create_entity() {
        const entity = super.create_entity();
        this.string_reps.insert(entity, `${entity}`);
        return entity;
    }

    /**
     * Create a new fork, where the left portion is a window `Entity`
     *
     * @param {Entity} window
     * @return [Entity, TilingFork]
     */
    create_fork(left, right = null) {
        const entity = this.create_entity();
        const fork = new TilingFork(left, right);
        this.forks.insert(entity, fork);
        return [entity, fork];
    }

    /**
     * Create a new top level fork
     *
     * @param {*} window Window to assign to the fork
     * @param {*} id The monitor + workspace which this fork is assigned to
     */
    create_toplevel(window, id) {
        const [entity, fork] = this.create_fork(TilingNode.window(window));
        fork.set_toplevel(this, entity, this.string_reps.get(entity), id);
        return [entity, fork];
    }

    /**
     * Deletes a fork entity from the world, performing any cleanup necessary
     *
     * @param {Entity} entity
     */
    delete_entity(entity) {
        const fork = this.forks.remove(entity);
        if (fork.is_toplevel) {
            let deleted = this.toplevel.delete(this.string_reps.get(entity));
        }

        super.delete_entity(entity);
    }

    /**
     * Detaches an entity from the a fork, re-arranging the fork's tree as necessary
     *
     * @param {Entity} fork_entity
     * @param {Entity} window
     * @return Reflow Fork ([Entity, TilingFork])
     */
    detach(fork_entity, window) {
        let reflow_fork = null;

        this.forks.with(fork_entity, (fork) => {
            Log.debug(`detaching Window(${window}) from Fork(${fork_entity})`);

            if (fork.left.is_window(window)) {
                if (fork.parent) {
                    Log.debug(`detaching Fork(${fork_entity}) and holding Window(${fork.right.entity}) for reassignment`);
                    reflow_fork = [fork.parent, this.reassign_child_to_parent(fork_entity, fork.parent, fork.right)];
                } else if (fork.right) {
                    reflow_fork = [fork_entity, fork];
                    if (fork.right.kind == WINDOW) {
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

                    if (fork.left.kind == FORK) {
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
     *
     * @param {string} fmt
     * @return string
     */
    display(fmt) {
        // NOTE: Display as flat array
        // for (const [entity, fork] of this.forks.iter()) {
        //     fmt += `fork (${entity}): ${fork.display('')}\n`;
        // }

        // NOTE: Display as hiearachy from toplevel forks
        for (const [entity, _] of this.toplevel.values()) {
            Log.debug(`displaying fork (${entity})`);
            fmt += '  ' + this._display_fork(entity, this.forks.get(entity), 1) + '\n';
        }

        return fmt;
    }

    /**
     * Finds the top level fork associated with the given entity
     *
     * @param {Entity} id Window + Workspace entity ID
     * @return Entity?
     */
    find_toplevel(id) {
        for (const [entity, value] of this.toplevel.values()) {
            if (value[0] == id[0] && value[1] == id[1]) {
                return entity;
            }
        }

        return null;
    }

    /**
     * Grows a fork based on the new size of one of its siblings
     *
     * @param {Ext} ext
     * @param {Entity} fork_e Entity of fork to grow
     * @param {TilingFork} fork_c Component of fork to grow
     * @param {Array} crect Dimensions of the window which grew
     * @param {bool} is_left Defines if the window that grew was the left sibling
     */
    grow_fork_by_sibling(ext, fork_e, fork_c, crect, is_left) {
        Log.debug(`growing Fork(${fork_e})`);

        let child = fork_c;
        let child_entity = fork_e;
        let parent_entity = child.parent;
        let parent;

        resize_node(child, is_left, [crect.x, crect.y, crect.width, crect.height]);

        while (parent_entity) {
            parent = this.forks.get(parent_entity);
            is_left = parent.left.is_fork(child_entity);

            this.resize_parent(parent, child, is_left);

            if (parent_exceeds(parent.area, child.area)) {
                Log.debug(`Fork(${parent_entity}) exceeded`);
                resize_node(parent, is_left, child.area);
            } else {
                Log.debug(`Fork(${parent_entity}) did not exceed`);
                // break
            }

            parent_entity = parent.parent;
            child = parent;
            child_entity = parent_entity;
        }

        if (parent) {
            parent.tile(this, ext, parent.area, parent.workspace);
        }
    }

    /**
     * Grows a sibling a fork
     *
     * @param {Ext} ext
     * @param {TilingFork} fork_c
     * @param {bool} is_left
     * @param {Flags} movement
     * @param {Array} crect
     */
    grow_sibling(ext, fork_e, fork_c, is_left, movement, crect) {
        if (fork_c.is_horizontal()) {
            if ((movement & (Lib.MOVEMENT_DOWN | Lib.MOVEMENT_UP)) != 0) {
                Log.debug(`growing Fork(${fork_e}) up/down`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 3);
            } else if (is_left) {
                if ((movement & Lib.MOVEMENT_RIGHT) != 0) {
                    Log.debug(`growing left child of Fork(${fork_e}) from left to right`);
                    this.readjust_fork_ratio_by_left(ext, crect.width, fork_c, fork_c.area[2]);
                } else {
                    Log.debug(`growing left child of Fork(${fork_e}) from right to left`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2);
                }
            } else if ((movement & Lib.MOVEMENT_RIGHT) != 0) {
                Log.debug(`growing right child of Fork(${fork_e}) from left to right`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2);
            } else {
                Log.debug(`growing right child of Fork(${fork_e}) from right to left`);
                this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area[2]);
            }
        } else {
            if ((movement & (Lib.MOVEMENT_LEFT | Lib.MOVEMENT_RIGHT)) != 0) {
                Log.debug(`growing Fork(${fork_e}) left/right`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 2);
            } else if (is_left) {
                if ((movement & Lib.MOVEMENT_DOWN) != 0) {
                    Log.debug(`growing left child of Fork(${fork_e}) from top to bottom`);
                    this.readjust_fork_ratio_by_left(ext, crect.height, fork_c, fork_c.area[3]);
                } else {
                    Log.debug(`growing left child of Fork(${fork_e}) from bottom to top`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3);
                }
            } else if ((movement & Lib.MOVEMENT_DOWN) != 0) {
                Log.debug(`growing right child of Fork(${fork_e}) from top to bottom`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3);
            } else {
                Log.debug(`growing right child of Fork(${fork_e}) from bottom to top`);
                this.readjust_fork_ratio_by_right(ext, crect.height, fork_c, fork_c.area[3]);
            }
        }
    }

    * iter(entity, kind=null) {
        let fork = this.forks.get(entity);
        let forks = new Array(2);

        while (fork) {
            if (fork.left.kind == FORK) {
                forks.push(this.forks.get(fork.left.entity));
            }

            if (kind == null || fork.left.kind == kind) {
                yield fork.left
            }

            if (fork.right) {
                if (fork.right.kind == FORK) {
                    forks.push(this.forks.get(fork.right.entity));
                }

                if (kind == null || fork.right.kind == kind) {
                  yield fork.right;
                }
            }

            fork = forks.pop();
        }
    }

    /**
     * Finds the largest window on a monitor + workspace
     *
     * @param {Ext} ext
     * @param {Entity} entity
     */
    largest_window_on(ext, entity) {
        let largest_window = null;
        let largest_size = 0;

        for (const win of this.iter(entity, WINDOW)) {
            const window = ext.windows.get(win.entity);

            if (window) {
                const rect = window.meta.get_frame_rect();
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
     *
     * @param {Entity} child_entity
     * @param {Entity} parent_entity
     * @param {*} child_fork
     */
    reassign_child_to_parent(child_entity, parent_entity, branch) {
        Log.debug(`reassigning Fork(${child_entity}) to parent Fork(${parent_entity})`);
        const parent = this.forks.get(parent_entity);

        if (parent.left.is_fork(child_entity)) {
            parent.left = branch;
            Log.debug(`reassigned Fork(${parent_entity}).left to (${parent.left.entity})`);
        } else {
            parent.right = branch;
            Log.debug(`reassigned Fork(${parent_entity}).right to (${parent.right.entity})`);
        }

        this.reassign_sibling(branch, parent_entity);
        this.delete_entity(child_entity);

        return parent;
    }

    /**
     * Reassigns a sibling based on whether it is a fork or a window.
     *
     * - If the sibling is a fork, reassign the parent.
     * - If it is a window, simply call on_attach
     *
     * @param {*} sibling
     * @param {*} parent
     */
    reassign_sibling(sibling, parent) {
        (sibling.kind == FORK ? this.reassign_parent : this.on_attach)
            .call(this, parent, sibling.entity);
    }

    /**
     * Reassigns children of the child entity to the parent entity
     *
     * Each fork has a left and optional right child entity
     *
     * @param {Entity} parent_entity
     * @param {Entity} child_entity
     * @param {TilingFork} parent_fork
     */
    reassign_children_to_parent(parent_entity, child_entity, p_fork) {
        Log.debug(`reassigning children of Fork(${child_entity}) to Fork(${parent_entity})`);

        const c_fork = this.forks.get(child_entity);
        p_fork.left = c_fork.left;
        p_fork.right = c_fork.right;

        this.reassign_sibling(p_fork.left, parent_entity);
        this.reassign_sibling(p_fork.right, parent_entity);

        this.delete_entity(child_entity);
    }

    /**
     * Reassigns a child to the given parent
     *
     * @param {Entity} parent
     * @param {Entity} child
     */
    reassign_parent(parent, child) {
        Log.debug(`assigning parent of Fork(${child}) to Fork(${parent})`);
        this.forks.get(child).set_parent(parent);
    }

    /**
     * Resizes the sibling of a fork
     *
     * @param {*} ext
     * @param {Entity} fork_e Entity of the fork being resized
     * @param {Entity} win_e Entity of the window sibling that was resized
     * @param {Flags} movement Info on the direction of movement
     * @param {Array} crect The new dimensions of the resized window
     */
    resize(ext, fork_e, win_e, movement, crect) {
        let fork_c = this.forks.get(fork_e);
        const is_left = fork_c.left.is_window(win_e);

        ((movement & Lib.MOVEMENT_SHRINK) != 0 ? this.shrink_sibling : this.grow_sibling)
            .call(this, ext, fork_e, fork_c, is_left, movement, crect);
    }

    resize_parent(parent, child, is_left) {
        Log.debug(`before ratio: ${parent.ratio}; (${child.area} : ${parent.area})`);

        const measure = parent.is_horizontal() ? 2 : 3;
        parent.ratio = is_left
            ? child.area[measure] / parent.area[measure]
            : (parent.area[measure] - child.area[measure]) / parent.area[measure];

        Log.debug(`after ratio: ${parent.ratio}`);
    }

    /// Readjusts the division of space between the left and right siblings of a fork
    readjust_fork_ratio_by_left(ext, left_length, fork, fork_length) {
        fork.set_ratio(left_length, fork_length).tile(this, ext, fork.area, fork.workspace);
    }

    /// Readjusts the division of space between the left and right siblings of a fork
    ///
    /// Determines the size of the left sibling based on the new length of the right sibling
    readjust_fork_ratio_by_right(ext, right_length, fork, fork_length) {
        this.readjust_fork_ratio_by_left(ext, fork_length - right_length, fork, fork_length);
    }

    resize_fork_in_direction(ext, child_e, child, is_left, consider_sibling, crect, measure) {
        Log.debug(`resizing fork in direction ${measure}: considering ${consider_sibling}`);
        let length = (measure == 2 ? crect.width : crect.height);

        if (consider_sibling) {
            length += is_left
                ? child.area[measure] - child.area_left[measure]
                : child.area_left[measure];
        }

        while (child.parent) {
            Log.debug(`length = ${length}`);
            const parent = this.forks.get(child.parent);

            child.area[measure] = length
            this.resize_parent(parent, child, parent.left.is_fork(child_e));

            child = parent;

            if (parent_exceeds(parent.area, child.area)) {
                break
            }

            child_e = child.parent;
        }

        child.tile(this, ext, child.area, child.workspace);
    }

    /**
     * Shrinks the sibling of a fork, possibly shrinking the fork itself.
     *
     * @param {Ext} ext
     * @param {Entity} fork_e of the fork being shrunk
     * @param {TilingFork} fork_c The fork that is being shrunk
     * @param {bool} is_left Defines if the shrunk window was the left sibling
     * @param {Flags} movement Info on the direction of movement
     * @param {Array} crect The new dimensions of the resized window
     */
    shrink_sibling(ext, fork_e, fork_c, is_left, movement, crect) {
        if (fork_c.is_horizontal()) {
            if ((movement & (Lib.MOVEMENT_DOWN | Lib.MOVEMENT_UP)) != 0) {
                Log.debug(`shrinking Fork(${fork_e}) up/down`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 3);
            } else if (is_left) {
                if ((movement & Lib.MOVEMENT_LEFT) != 0) {
                    Log.debug(`shrinking left child of Fork(${fork_e}) from right to left`);
                    this.readjust_fork_ratio_by_left(ext, crect.width, fork_c, fork_c.area[2]);
                } else {
                    Log.debug(`shrinking left child of Fork(${fork_e}) from left to right`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2);
                }
            } else if ((movement & Lib.MOVEMENT_LEFT) != 0) {
                Log.debug(`shrinking right child of Fork(${fork_e}) from right to left`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 2);
            } else {
                Log.debug(`shrinking right child of Fork(${fork_e}) from left to right`);
                this.readjust_fork_ratio_by_right(ext, crect.width, fork_c, fork_c.area[2]);
            }
        } else {
            if ((movement & (Lib.MOVEMENT_LEFT | Lib.MOVEMENT_RIGHT)) != 0) {
                Log.debug(`shrinking Fork(${fork_e}) left/right`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, false, crect, 2);
            } else if (is_left) {
                if ((movement & Lib.MOVEMENT_UP) != 0) {
                    Log.debug(`shrinking left child of Fork(${fork_e}) from bottom to top`);
                    this.readjust_fork_ratio_by_left(ext, crect.height, fork_c, fork_c.area[3]);
                } else {
                    Log.debug(`shrinking left child of Fork(${fork_e}) from top to bottom`);
                    this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3);
                }
            } else if ((movement & Lib.MOVEMENT_UP) != 0) {
                Log.debug(`shrinking right child of Fork(${fork_e}) from bottom to top`);
                this.resize_fork_in_direction(ext, fork_e, fork_c, is_left, true, crect, 3);
            } else {
                Log.debug(`shrinking right child of Fork(${fork_e}) from top to bottom`);
                this.readjust_fork_ratio_by_right(ext, crect.height, fork_c, fork_c.area[3]);
            }
        }
    }

    _attach(onto_entity, new_entity, assoc, entity, fork, result) {
        if (result) {
            assoc(result[0], onto_entity);
            assoc(result[0], new_entity);
            return result;
        } else {
            assoc(entity, new_entity);
            return [entity, fork];
        }
    }

    _display_branch(branch, scope) {
        return branch.kind == WINDOW
            ? `Window(${branch.entity})`
            : this._display_fork(branch.entity, this.forks.get(branch.entity), scope + 1);
    }

    _display_fork(entity, fork, scope) {
        let fmt = `Fork(${entity}) [${fork.area}]: {\n`;

        fmt += ' '.repeat((1 + scope) * 2) + 'left:  ' + this._display_branch(fork.left, scope) + ',\n';

        if (fork.right) {
            fmt += ' '.repeat((1 + scope) * 2) + 'right: ' + this._display_branch(fork.right, scope) + ',\n';
        }

        fmt += ' '.repeat(scope * 2) + '}';
        return fmt;
    }
}

/**
 * A node within the `AutoTiler`, which may contain either windows and/or sub-forks.
 *
 * @param {Entity} left The window or fork attached to the left branch of this node
 * @param {Entity} right The window or fork attached to the right branch of this node
 * @param {f32} ratio The division of space between the left and right fork
 * @param {Orientation} orientation The direction to tile this fork
 */
var TilingFork = class TilingFork {
    constructor(left, right = null) {
        this.left = left;
        this.right = right;
        this.area = null;
        this.area_left = null;
        this.parent = null;
        this.workspace = null;
        this.ratio = .5;
        this.orientation = ORIENTATION_HORIZONTAL;
        this.is_toplevel = false;
    }

    display(fmt) {
        fmt += `{\n  parent: ${this.parent},`;

        if (this.left) {
            fmt += `\n  left: ${this.left.display('')},`;
        }

        if (this.right) {
            fmt += `\n  right: ${this.right.display('')},`;
        }

        fmt += `\n  orientation: ${orientation_as_str(this.orientation)}\n}`;
        return fmt;
    }

    is_horizontal() {
        return ORIENTATION_HORIZONTAL == this.orientation;
    }

    /**
     * Replaces the association of a window in a fork with another
     *
     * @param {Entity} a
     * @param {Entity} b
     */
    replace_window(a, b) {
        if (this.left.is_window(a)) {
            this.left.entity = b;
        } else if (this.right) {
            this.right.entity = b;
        } else {
            return false;
        }

        return true;
    }

    set_orientation(orientation) {
        this.orientation = orientation;
        return this;
    }

    set_parent(parent) {
        this.parent = parent;
        return this;
    }

    set_ratio(left_length, fork_length) {
        this.ratio = left_length / fork_length;
        Log.debug(`new ratio: ${this.ratio}`);
        return this;
    }

    set_toplevel(tiler, entity, string, id) {
        this.is_toplevel = true;
        tiler.toplevel.set(string, [entity, id]);
        return this;
    }

    /**
     * Tiles all windows within this fork into the given area
     *
     * @param {AutoTiler} tiler The tiler which this fork is an entity of
     * @param {Ext} ext
     * @param {[u32, 4]} area
     */
    tile(tiler, ext, area, workspace) {
        /// Memorize our area for future tile reflows

        if (null == this.area && null == this.parent) {
            this.area = [
                area[0] + ext.gap_outer,
                area[1] + ext.gap_outer,
                area[2] - ext.gap_outer * 2,
                area[3] - ext.gap_outer * 2,
            ];
        } else {
            this.area = Array.from(area);
        }

        this.workspace = workspace;

        if (this.right) {
            const [l, p] = ORIENTATION_HORIZONTAL == this.orientation
                ? [WIDTH, XPOS] : [HEIGHT, YPOS];

            const length = Math.round(area[l] * this.ratio);

            let region = Array.from(this.area);

            region[l] = length - ext.gap_inner_half;

            this.area_left = Array.from(region);
            this.left.tile(tiler, ext, region, workspace);

            region[p] = region[p] + length + ext.gap_inner;
            region[l] = this.area[l] - length - ext.gap_inner;

            this.right.tile(tiler, ext, region, workspace);
        } else {
            this.left.tile(tiler, ext, this.area, workspace);
            this.area_left = this.area;
        }
    }

    toggle_orientation() {
        this.orientation = Lib.ORIENTATION_HORIZONTAL == this.orientation
            ? Lib.ORIENTATION_VERTICAL
            : Lib.ORIENTATION_HORIZONTAL;
    }
}
/**
 * A tiling node may either refer to a window entity, or another fork entity.
 *
 * @param {Number} kind Defines the kind of entity that has been stored
 * @param {Entity} entity May identify either a window entity, or a fork entity
 */
var TilingNode = class TilingNode {
    constructor(kind, entity) {
        this.kind = kind;
        this.entity = entity;
    }

    /**
     * Create a fork variant of a `TilingNode`
     *
     * @param {TilingFork} fork
     *
     * @return TilingNode
     */
    static fork(fork) {
        return new TilingNode(FORK, fork);
    }

    /**
     * Create the window variant of a `TilingNode`
     *
     * @param {Entity} window
     *
     * @return TilingNode
     */
    static window(window) {
        return new TilingNode(WINDOW, window);
    }

    display(fmt) {
        fmt += `{\n    kind: ${node_variant_as_string(this.kind)},\n    entity: (${this.entity})\n  }`;
        return fmt;
    }

    /**
     * Asks if this fork is the fork we are looking for
     *
     * @param {*} fork
     */
    is_fork(entity) {
        return FORK == this.kind && entity_eq(this.entity, entity);
    }

    /**
     * Asks if this window is the window we are looking for
     *
     * @param {*} window
     */
    is_window(entity) {
        return WINDOW == this.kind && entity_eq(this.entity, entity);
    }

    /**
     * Tiles all windows associated with this node
     *
     * @param {*} tiler
     * @param {*} ext
     * @param {*} area
     */
    tile(tiler, ext, area, workspace) {
        if (FORK == this.kind) {
            Log.debug(`tiling Fork(${this.entity}) into [${area}]`);
            tiler.forks.get(this.entity).tile(tiler, ext, area, workspace);
        } else {
            Log.debug(`tiling Window(${this.entity}) into [${area}]`);
            const window = ext.windows.get(this.entity);

            window.move({
                x: area[0],
                y: area[1],
                width: area[2],
                height: area[3]
            });

            window.meta.change_workspace_by_index(workspace, false);
        }
    }
}

function node_variant_as_string(value) {
    return value == FORK ? "NodeVariant::Fork" : "NodeVariant::Window";
}

function parent_exceeds(parent, child) {
    return parent[0] >= child[0]
        && parent[1] >= child[1]
        && (parent[0] + parent[2]) <= (child[0] + child[2])
        && (parent[1] + parent[3]) <= (child[1] + child[3]);
}

function resize_node(fork, is_left, child_area) {
    Log.debug(`before: (${fork.area}) (${child_area})`);
    fork.area[0] = Math.min(fork.area[0], child_area[0]);
    fork.area[1] = Math.min(fork.area[1], child_area[1]);

    let width, height;

    if (is_left) {
        width = child_area[2];
        height = child_area[3];
    } else {
        width = fork.area[0] - child_area[0] + child_area[2];
        height = fork.area[1] - child_area[1] + child_area[3];
    }

    fork.area[2] = width;
    fork.area[3] = height;

    Log.debug(`after: (${fork.area})`);
}
