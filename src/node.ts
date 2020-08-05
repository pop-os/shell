// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Ecs from 'ecs';

import type { Forest } from './forest';
import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Rectangle } from 'rectangle';
import type { Stack } from 'stack';

/** A node is either a fork a window */
export enum NodeKind {
    FORK = 1,
    WINDOW = 2,
    STACK = 3,
}

/** Fetch the string representation of this value */
function node_variant_as_string(value: NodeKind): string {
    return value == NodeKind.FORK ? "NodeVariant::Fork" : "NodeVariant::Window";
}

/** Identifies this node as a fork */
export interface NodeFork {
    kind: 1;
    entity: Entity;
}

/** Identifies this node as a window */
export interface NodeWindow {
    kind: 2;
    entity: Entity;
}

export interface NodeStack {
    kind: 3;
    idx: number;
    entities: Array<Entity>;
    rect: Rectangle | null;
}

function stack_detach(node: NodeStack, stack: Stack, idx: number) {
    node.entities.splice(idx, 1);
    const c = stack.components[idx];
    for (const s of c.signals) c.meta.disconnect(s);
    stack.buttons.remove(c.button)?.destroy();
    c.meta.get_compositor_private()?.show();
    stack.components.splice(idx, 1);
}

export function stack_find(node: NodeStack, entity: Entity): null | number {
    let idx = 0;
    while (idx < node.entities.length) {
        if (Ecs.entity_eq(entity, node.entities[idx])) {
            return idx;
        }
        idx += 1
    }

    return null;
}

/** Move the window in a stack to the left, and detach if it it as the end. */
export function stack_move_left(ext: Ext, forest: Forest, node: NodeStack, entity: Entity): boolean {
    const stack = forest.stacks.get(node.idx);
    if (!stack) return false;

    let moved = false;
    let idx = 0;
    for (const cmp of node.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            if (idx === 0) {
                stack_detach(node, stack, 0);
                moved = false;
            } else {
                stack_swap(node, idx - 1, idx)
                stack.active_id -= 1;
                ext.auto_tiler?.update_stack(ext, node);
                moved = true;
            }
            break
        }

        idx += 1;
    }

    return moved;
}

/** Move the window in a stack to the right, and detach if it is at the end. */
export function stack_move_right(ext: Ext, forest: Forest, node: NodeStack, entity: Entity): boolean {
    const stack = forest.stacks.get(node.idx);
    if (!stack) return false;

    let moved = false;
    let idx = 0;
    const max = node.entities.length - 1;
    for (const cmp of node.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            if (idx === max) {
                stack_detach(node, stack, idx);
                moved = false;
            } else {
                stack_swap(node, idx + 1, idx);
                stack.active_id += 1;
                ext.auto_tiler?.update_stack(ext, node);
                moved = true;
            }
            break
        }

        idx += 1;
    }

    return moved;
}

export function stack_replace(ext: Ext, node: NodeStack, from: number, window: Entity) {
    if (!ext.auto_tiler) return;

    const stack = ext.auto_tiler.forest.stacks.get(node.idx);
    if (!stack) return;

    const win = ext.windows.get(window);
    if (win) stack.replace(from, win)
}

/** Removes a window from a stack */
export function stack_remove(forest: Forest, node: NodeStack, entity: Entity): null | number {
    const stack = forest.stacks.get(node.idx);
    if (!stack) return null;

    let idx = 0;

    for (const cmp of node.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            node.entities.splice(idx, 1);
            stack.buttons.remove(stack.components[idx].button)?.destroy();
            stack.components.splice(idx, 1);
            return idx;
        }
        idx += 1;
    }

    return null;
}

function stack_swap(node: NodeStack, from: number, to: number) {
    const tmp = node.entities[from];
    node.entities[from] = node.entities[to];
    node.entities[to] = tmp;
}

export type NodeADT = NodeFork | NodeWindow | NodeStack;

/** A tiling node may either refer to a window entity, or another fork entity */
export class Node {
    /** The actual data for this node */
    inner: NodeADT;

    constructor(inner: NodeADT) {
        this.inner = inner;
    }

    /** Create a fork variant of a `Node` */
    static fork(entity: Entity): Node {
        return new Node({ kind: NodeKind.FORK, entity });
    }

    /** Create the window variant of a `Node` */
    static window(entity: Entity): Node {
        return new Node({ kind: NodeKind.WINDOW, entity });
    }

    static stacked(window: Entity, idx: number): Node {
        const node = new Node({
            kind: NodeKind.STACK,
            entities: [window],
            idx,
            rect: null
        });

        return node;
    }

    /** Generates a string representation of the this value. */
    display(fmt: string): string {
        fmt += `{\n    kind: ${node_variant_as_string(this.inner.kind)},\n    `;

        switch (this.inner.kind) {
            // Fork + Window
            case 1:
            case 2:
                fmt += `entity: (${this.inner.entity})\n  }`;
                return fmt;
            // Stack
            case 3:
                fmt += `entities: ${this.inner.entities}\n  }`;
                return fmt;
        }


    }

    /** Check if the entity exists as a child of this stack */
    is_in_stack(entity: Entity): boolean {
        if (this.inner.kind === 3) {
            for (const compare of this.inner.entities) {
                if (Ecs.entity_eq(entity, compare)) return true;
            }
        }

        return false;
    }

    /** Asks if this fork is the fork we are looking for */
    is_fork(entity: Entity): boolean {
        return this.inner.kind === 1 && Ecs.entity_eq(this.inner.entity, entity);
    }

    /** Asks if this window is the window we are looking for */
    is_window(entity: Entity): boolean {
        return this.inner.kind === 2 && Ecs.entity_eq(this.inner.entity, entity);
    }

    /** Calculates the future arrangement of windows in this node */
    measure(
        tiler: Forest,
        ext: Ext,
        parent: Entity,
        area: Rectangle,
        record: (win: Entity, parent: Entity, area: Rectangle) => void
    ) {
        switch (this.inner.kind) {
            // Fork
            case 1:
                const fork = tiler.forks.get(this.inner.entity);
                if (fork) {
                    record
                    fork.measure(tiler, ext, area, record);
                }

                break
            // Window
            case 2:
                record(this.inner.entity, parent, area.clone());
                break
            // Stack
            case 3:
                const size = ext.dpi * 4;

                this.inner.rect = area.clone();
                this.inner.rect.y += size * 6;
                this.inner.rect.height -= size * 6;

                for (const entity of this.inner.entities) {
                    record(entity, parent, this.inner.rect);
                }

                if (ext.auto_tiler) {
                    ext.auto_tiler.forest.stack_updates.push([this.inner, parent]);
                }
        }
    }
}
