const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as ecs from 'ecs';
import * as lib from 'lib';
import * as log from 'log';
import * as node from 'node';
import * as result from 'result';

import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Forest } from 'forest';
import type { Fork } from 'fork';
import type { Rectangle } from 'rectangle';
import type { Result } from 'result';
import type { ShellWindow } from 'window';

const GLib: GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const { Ok, Err, ERR } = result;
const { NodeKind } = node;
const Tags = Me.imports.tags;

export class AutoTiler {
    forest: Forest;
    attached: ecs.Storage<Entity>;

    constructor(forest: Forest, attached: ecs.Storage<Entity>) {
        this.forest = forest;
        this.attached = attached;
    }

    /** Swap window associations in the auto-tiler
    *
    * Call this when a window has swapped positions with another, so that we
    * may update the associations in the auto-tiler world.
    */
    attach_swap(a: Entity, b: Entity) {
        const a_ent = this.attached.remove(a);
        const b_ent = this.attached.remove(b);

        if (a_ent) {
            this.forest.forks.with(a_ent, (fork) => fork.replace_window(a, b));
            this.attached.insert(b, a_ent);
        }

        if (b_ent) {
            this.forest.forks.with(b_ent, (fork) => fork.replace_window(b, a));
            this.attached.insert(a, b_ent);
        }
    }

    /** Attaches `win` to an optionally-given monitor */
    attach_to_monitor(ext: Ext, win: ShellWindow, workspace_id: [number, number]) {
        let rect = ext.monitor_work_area(workspace_id[0]);
        rect.x += ext.gap_outer;
        rect.y += ext.gap_outer;
        rect.width -= ext.gap_outer * 2;
        rect.height -= ext.gap_outer * 2;

        const [entity, fork] = this.forest.create_toplevel(ext, win.entity, rect.clone(), workspace_id)
        this.attached.insert(win.entity, entity);

        log.debug(`attached Window(${win.entity}) to Fork(${entity}) on Monitor(${workspace_id})`);

        this.tile(ext, fork, rect);
        this.log_tree_nodes(ext);
        win.meta.maximize(Meta.MaximizeFlags.BOTH)
    }

    /** Tiles a window into another */
    attach_to_window(ext: Ext, attachee: ShellWindow, attacher: ShellWindow) {
        log.debug(`attempting to attach ${attacher.name(ext)} to ${attachee.name(ext)}`);

        let attached = this.forest.attach_window(ext, attachee.entity, attacher.entity);

        if (attached) {
            const [, fork] = attached;
            const monitor = ext.monitors.get(attachee.entity);
            if (monitor) {
                fork.ratio_prev = 0.5;
                fork.ratio = 0.5;
                this.tile(ext, fork, fork.area.clone());
                this.log_tree_nodes(ext);
                return true;
            } else {
                log.error(`missing monitor association for Window(${attachee.entity})`);
            }
        }

        this.log_tree_nodes(ext);
    }

    /** Tile a window onto a workspace */
    attach_to_workspace(ext: Ext, win: ShellWindow, id: [number, number]) {
        log.debug(`workspace id: ${id}`);
        const toplevel = this.forest.find_toplevel(id);

        if (toplevel) {
            log.debug(`found toplevel at ${toplevel}`);
            const onto = this.forest.largest_window_on(ext, toplevel);
            if (onto) {
                log.debug(`largest window = ${onto.entity}`);
                if (this.attach_to_window(ext, onto, win)) {
                    return;
                }
            }

        }

        this.attach_to_monitor(ext, win, id);
    }

    /** Automatically tiles a window into the window tree.
     *
     * ## Implementation Notes
     *
     * - First tries to tile onto the focused window
     * - Then tries to tile onto a monitor
     */
    auto_tile(ext: Ext, win: ShellWindow, ignore_focus: boolean = false) {
        const result = this.fetch_mode(ext, win, ignore_focus);
        if (result.kind == ERR) {
            log.debug(`auto_tile: ${result.value}`);
            this.attach_to_workspace(ext, win, ext.workspace_id(win));
        } else {
            this.detach_window(ext, win.entity);
            this.attach_to_window(ext, result.value, win)
        }
    }

    /** Detaches the window from a tiling branch, if it is attached to one. */
    detach_window(ext: Ext, win: Entity) {
        this.attached.take_with(win, (prev_fork: Entity) => {
            const reflow_fork = this.forest.detach(prev_fork, win);

            if (reflow_fork) {
                log.debug(`found reflow_fork`);
                const fork = reflow_fork[1];
                this.tile(ext, fork, fork.area);
                if (!reflow_fork[1].right) {
                    const window = ext.windows.get(reflow_fork[1].left.entity);
                    if (window) {
                        window.meta.maximize(Meta.MaximizeFlags.BOTH);
                    }
                }
            }

            this.log_tree_nodes(ext);
        });
    }

    /** Swaps the location of two windows if the dropped window was dropped onto its sibling */
    dropped_on_sibling(ext: Ext, win: Entity): boolean {
        const fork_entity = this.attached.get(win);

        if (fork_entity) {
            const cursor = lib.cursor_rect();
            const fork = this.forest.forks.get(fork_entity);

            if (fork) {
                if (fork.left.kind == NodeKind.WINDOW && fork.right && fork.right.kind == NodeKind.WINDOW) {
                    if (fork.left.is_window(win)) {
                        const sibling = ext.windows.get(fork.right.entity);
                        if (sibling && sibling.rect().contains(cursor)) {
                            log.debug(`${ext.names.get(win)} was dropped onto ${sibling.name(ext)}`);

                            fork.left.entity = fork.right.entity;
                            fork.right.entity = win;

                            this.tile(ext, fork, fork.area);
                            return true;
                        }
                    } else if (fork.right.is_window(win)) {
                        const sibling = ext.windows.get(fork.left.entity);
                        if (sibling && sibling.rect().contains(cursor)) {
                            log.debug(`${ext.names.get(win)} was dropped onto ${sibling.name(ext)}`);

                            fork.right.entity = fork.left.entity;
                            fork.left.entity = win;

                            this.tile(ext, fork, fork.area);
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /** Performed when a window that has been dropped is destined to be tiled
     *
     * ## Implementation Notes
     *
     * - If the window is dropped onto a window, tile onto it
     * - If no window is present, tile onto the monitor
     */
    on_drop(ext: Ext, win: ShellWindow) {
        log.debug(`dropped Window(${win.entity})`);
        if (this.dropped_on_sibling(ext, win.entity)) return;

        const [cursor, monitor] = ext.cursor_status();
        const workspace = ext.active_workspace();

        let attach_to = null;
        for (const found of ext.windows_at_pointer(cursor, monitor, workspace)) {
            if (found != win && this.attached.contains(found.entity)) {
                attach_to = found;
                break
            }
        }

        this.detach_window(ext, win.entity);

        if (attach_to) {
            log.debug(`found Window(${attach_to.entity}) at pointer`);
            this.attach_to_window(ext, attach_to, win);
        } else {
            const toplevel = this.forest.find_toplevel([monitor, workspace]);
            if (toplevel) {
                attach_to = this.forest.largest_window_on(ext, toplevel);
                if (attach_to) {
                    this.attach_to_window(ext, attach_to, win);
                    return;
                }
            }

            this.attach_to_monitor(ext, win, ext.workspace_id(win));
        }
    }

    /** Schedules a fork to be reflowed */
    reflow(ext: Ext, win: Entity) {
        const fork_entity = this.attached.get(win);
        if (!fork_entity) return

        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            const fork = this.forest.forks.get(fork_entity);
            if (fork) this.tile(ext, fork, fork.area);

            return false;
        });
    }

    tile(ext: Ext, fork: Fork, area: Rectangle) {
        ext.tiling = true;
        this.forest.tile(ext, fork, area);
        ext.tiling = false;
    }

    toggle_floating(ext: Ext) {
        const focused = ext.focus_window();
        if (!focused) return;

        if (ext.contains_tag(focused.entity, Tags.Floating)) {
            ext.delete_tag(focused.entity, Tags.Floating);
            this.auto_tile(ext, focused, false);
        } else {
            const fork_entity = this.attached.get(focused.entity);
            if (fork_entity) {
                this.detach_window(ext, focused.entity);
                ext.add_tag(focused.entity, Tags.Floating);
            }
        }
    }

    toggle_orientation(ext: Ext) {
        const result = this.toggle_orientation_(ext);
        if (result.kind == ERR) {
            log.warn(`toggle_orientation: ${result.value}`);
        } else {
            log.info('toggled orientation');
        }
    }

    windows_are_siblings(a: Entity, b: Entity): Entity | null {
        const a_parent = this.attached.get(a);
        const b_parent = this.attached.get(b);

        if (a_parent !== null && null !== b_parent && ecs.entity_eq(a_parent, b_parent)) {
            return a_parent;
        }

        return null;
    }

    private fetch_mode(ext: Ext, win: ShellWindow, ignore_focus: boolean = false): Result<ShellWindow, string> {
        if (ignore_focus) {
            return Err('ignoring focus');
        }

        if (!ext.prev_focused) {
            return Err('no window has been previously focused');
        }

        let onto = ext.windows.get(ext.prev_focused);

        if (!onto) {
            return Err('no focus window');
        }

        if (ecs.entity_eq(onto.entity, win.entity)) {
            return Err('tiled window and attach window are the same window');
        }

        if (!onto.is_tilable(ext)) {
            return Err('focused window is not tilable');
        }

        return onto.meta.get_monitor() == win.meta.get_monitor() && onto.workspace_id() == win.workspace_id()
            ? Ok(onto)
            : Err('window is not on the same monitor or workspace');
    }

    private log_tree_nodes(ext: Ext) {
        let buf = this.forest.fmt(ext);
        log.info('\n\n' + buf);
    }

    private toggle_orientation_(ext: Ext): Result<void, string> {
        const focused = ext.focus_window();
        if (!focused) {
            return Err('no focused window to toggle');
        }

        if (focused.meta.get_maximized()) {
            return Err('cannot toggle maximized window');
        }

        const fork_entity = this.attached.get(focused.entity);
        if (!fork_entity) {
            return Err(`window is not attached to the tree`)
        }

        const fork = this.forest.forks.get(fork_entity);
        if (!fork) {
            return Err('window\'s fork attachment does not exist');
        }

        fork.toggle_orientation();
        this.forest.measure(ext, fork, fork.area);

        for (const child of this.forest.iter(fork_entity, NodeKind.FORK)) {
            const fork = this.forest.forks.get(child.entity);
            if (fork) {
                fork.rebalance_orientation();
                this.forest.measure(ext, fork, fork.area);
            } else {
                log.error('toggle_orientation: Fork(${child.entity}) does not exist to have its orientation toggled');
            }
        }

        this.forest.arrange(ext, fork.workspace);

        return Ok(void (0));
    }
}
