declare const imports: any;

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

    operation(change: Rectangle) {
        Log.debug(`changing from (${this.rect.fmt()}) to (${change.fmt()})`);
        const xpos = this.rect.x == change.x;
        const ypos = this.rect.y == change.y;

        if (xpos && ypos) {
            if (this.rect.width == change.width) {
                if (this.rect.height == change.width) {
                    Log.debug(`no movement detected`);
                    return Lib.MOVEMENT_NONE;
                } else if (this.rect.height < change.height) {
                    Log.debug(`grow down`);
                    return Lib.MOVEMENT_GROW | Lib.MOVEMENT_DOWN;
                } else {
                    Log.debug(`shrink up`);
                    return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_UP;
                }
            } else if (this.rect.width < change.width) {
                Log.debug(`grow right`);
                return Lib.MOVEMENT_GROW | Lib.MOVEMENT_RIGHT;
            } else {
                Log.debug(`shrink left`);
                return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_LEFT;
            }
        } else if (xpos) {
            if (this.rect.height < change.height) {
                Log.debug(`grow up`);
                return Lib.MOVEMENT_GROW | Lib.MOVEMENT_UP;
            } else {
                Log.debug(`shrink down`);
                return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_DOWN;
            }
        } else if (ypos) {
            if (this.rect.width < change.width) {
                Log.debug(`grow left`);
                return Lib.MOVEMENT_GROW | Lib.MOVEMENT_LEFT;
            } else {
                Log.debug(`shrink right`);
                return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_RIGHT;
            }
        } else {
            return Lib.MOVEMENT_MOVED;
        }
    }
}
