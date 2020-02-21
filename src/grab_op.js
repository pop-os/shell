const Me = imports.misc.extensionUtils.getCurrentExtension();

const Lib = Me.imports.lib;

var GrabOp = class GrabOp {
    constructor(entity, rect) {
        this.entity = entity;
        this.rect = rect;
    }

    operation(change) {
        Lib.log(`changing from (${Lib.fmt_rect(this.rect)}) to (${Lib.fmt_rect(change)})`);
        const xpos = this.rect.x == change.x;
        const ypos = this.rect.y == change.y;

        if (xpos && ypos) {
            if (this.rect.width == change.width) {
                if (this.rect.height == change.width) {
                    log(`no movement detected`);
                    return Lib.MOVEMENT_NONE;
                } else if (this.rect.height < change.height) {
                    log(`grow down`);
                    return Lib.MOVEMENT_GROW | Lib.MOVEMENT_DOWN;
                } else {
                    log(`shrink up`);
                    return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_UP;
                }
            } else if (this.rect.width < change.width) {
                log(`grow right`);
                return Lib.MOVEMENT_GROW | Lib.MOVEMENT_RIGHT;
            } else {
                log(`shrink left`);
                return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_LEFT;
            }
        } else if (xpos) {
            if (this.rect.height < change.height) {
                log(`grow up`);
                return Lib.MOVEMENT_GROW | Lib.MOVEMENT_UP;
            } else {
                log(`shrink down`);
                return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_DOWN;
            }
        } else if (ypos) {
            if (this.rect.width < change.width) {
                log(`grow left`);
                return Lib.MOVEMENT_GROW | Lib.MOVEMENT_LEFT;
            } else {
                log(`shrink right`);
                return Lib.MOVEMENT_SHRINK | Lib.MOVEMENT_RIGHT;
            }
        } else {
            return Lib.MOVEMENT_MOVED;
        }
    }
}
