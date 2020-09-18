// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as log from 'log';

export class ActiveHint {
    // TODO - move the window.border code here in the future
    constructor() {
        log.debug(`create active hint`);
    }
}

/**
 * GTK.ColorChooser - simple color wheel
 */
export class ActiveHintSelector {
    constructor() {
        log.debug(`create hint selector`);
    }
}