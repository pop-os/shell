const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';

import type { Entity } from 'ecs';
import type { Rectangle } from 'rectangle';

export class GrabOp {
    entity: Entity;
    rect: Rectangle;

    constructor(entity: Entity, rect: Rectangle) {
        this.entity = entity;
        this.rect = rect;
    }

    operation(change: Rectangle): Lib.Movement {
        const xpos = this.rect.x == change.x;
        const ypos = this.rect.y == change.y;

        if (xpos && ypos) {
            if (this.rect.width == change.width) {
                if (this.rect.height == change.width) {
                    return Lib.Movement.NONE;
                } else if (this.rect.height < change.height) {
                    return Lib.Movement.GROW | Lib.Movement.DOWN;
                } else {
                    return Lib.Movement.SHRINK | Lib.Movement.UP;
                }
            } else if (this.rect.width < change.width) {
                return Lib.Movement.GROW | Lib.Movement.RIGHT;
            } else {
                return Lib.Movement.SHRINK | Lib.Movement.LEFT;
            }
        } else if (xpos) {
            if (this.rect.height < change.height) {
                return Lib.Movement.GROW | Lib.Movement.UP;
            } else {
                return Lib.Movement.SHRINK | Lib.Movement.DOWN;
            }
        } else if (ypos) {
            if (this.rect.width < change.width) {
                return Lib.Movement.GROW | Lib.Movement.LEFT;
            } else {
                return Lib.Movement.SHRINK | Lib.Movement.RIGHT;
            }
        } else {
            return Lib.Movement.MOVED;
        }
    }
}
