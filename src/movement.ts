export enum Movement {
    NONE = 0,
    MOVED = 0b1,
    GROW = 0b10,
    SHRINK = 0b100,
    LEFT = 0b1000,
    UP = 0b10000,
    RIGHT = 0b100000,
    DOWN = 0b1000000,
}

export function calculate(from: Rectangular, change: Rectangular): Movement {
    const xpos = from.x == change.x;
    const ypos = from.y == change.y;

    if (xpos && ypos) {
        if (from.width == change.width) {
            if (from.height == change.width) {
                return Movement.NONE;
            } else if (from.height < change.height) {
                return Movement.GROW | Movement.DOWN;
            } else {
                return Movement.SHRINK | Movement.UP;
            }
        } else if (from.width < change.width) {
            return Movement.GROW | Movement.RIGHT;
        } else {
            return Movement.SHRINK | Movement.LEFT;
        }
    } else if (xpos) {
        if (from.height < change.height) {
            return Movement.GROW | Movement.UP;
        } else {
            return Movement.SHRINK | Movement.DOWN;
        }
    } else if (ypos) {
        if (from.width < change.width) {
            return Movement.GROW | Movement.LEFT;
        } else {
            return Movement.SHRINK | Movement.RIGHT;
        }
    } else {
        return Movement.MOVED;
    }
}
