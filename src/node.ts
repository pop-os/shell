const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Ecs from 'ecs';

import type { AutoTiler } from 'auto_tiler';
import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Rectangle } from 'rectangle';

export enum NodeKind {
    FORK = 1,
    WINDOW = 2,
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
export class Node {
    private inner: NodeADT;

    constructor(kind: NodeKind, entity: Entity) {
        this.inner = { kind: kind, entity: entity };
    }

    /// Create a fork variant of a `Node`
    static fork(fork: Entity): Node {
        return new Node(NodeKind.FORK, fork);
    }

    /// Create the window variant of a `Node`
    static window(window: Entity): Node {
        return new Node(NodeKind.WINDOW, window);
    }

    get entity(): Entity { return this.inner.entity; }

    set entity(entity: Entity) { this.inner.entity = entity; }

    get kind(): NodeKind { return this.inner.kind; }

    set kind(kind: NodeKind) { this.inner.kind = kind; }

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
        } else if (tiler.move_windows) {
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
        } else {
            return true;
        }

        return false;
    }
}

function node_variant_as_string(value: number): string {
    return value == NodeKind.FORK ? "NodeVariant::Fork" : "NodeVariant::Window";
}
