const Me = imports.misc.extensionUtils.getCurrentExtension();

import { Entity } from 'ecs';
import { Rectangle } from 'rectangle';

import * as Lib from 'lib';
import * as Log from 'log';

export class GrabOp {
    entity: Entity;
    rect: Rectangle;

    constructor(entity: Entity, rect: Rectangle) {
        this.entity = entity;
        this.rect = rect;
    }

    operation(change: Rectangle): Lib.Movement {
        Log.debug(`changing from (${this.rect.fmt()}) to (${change.fmt()})`);
        const xpos = this.rect.x == change.x;
        const ypos = this.rect.y == change.y;

        if (xpos && ypos) {
            if (this.rect.width == change.width) {
                if (this.rect.height == change.width) {
                    Log.debug(`no movement detected`);
                    return Lib.Movement.NONE;
                } else if (this.rect.height < change.height) {
                    Log.debug(`grow down`);
                    return Lib.Movement.GROW | Lib.Movement.DOWN;
                } else {
                    Log.debug(`shrink up`);
                    return Lib.Movement.SHRINK | Lib.Movement.UP;
                }
            } else if (this.rect.width < change.width) {
                Log.debug(`grow right`);
                return Lib.Movement.GROW | Lib.Movement.RIGHT;
            } else {
                Log.debug(`shrink left`);
                return Lib.Movement.SHRINK | Lib.Movement.LEFT;
            }
        } else if (xpos) {
            if (this.rect.height < change.height) {
                Log.debug(`grow up`);
                return Lib.Movement.GROW | Lib.Movement.UP;
            } else {
                Log.debug(`shrink down`);
                return Lib.Movement.SHRINK | Lib.Movement.DOWN;
            }
        } else if (ypos) {
            if (this.rect.width < change.width) {
                Log.debug(`grow left`);
                return Lib.Movement.GROW | Lib.Movement.LEFT;
            } else {
                Log.debug(`shrink right`);
                return Lib.Movement.SHRINK | Lib.Movement.RIGHT;
            }
        } else {
            return Lib.Movement.MOVED;
        }
    }
}
