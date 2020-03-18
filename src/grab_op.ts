// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Movement from 'movement';

import type { Entity } from 'ecs';
import type { Rectangle } from 'rectangle';

export class GrabOp {
    entity: Entity;
    rect: Rectangle;

    constructor(entity: Entity, rect: Rectangle) {
        this.entity = entity;
        this.rect = rect;
    }

    operation(change: Rectangle): Movement.Movement {
        return Movement.calculate(this.rect, change);
    }
}
