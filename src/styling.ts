// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as log from 'log';

export const CSS_PATHS = {
    "CONFIG": "",
    "LOCAL": "",
    "SYSTEM": "",
};

/**
 * This class loads any custom css fragments from $HOME/.config, $HOME/.local/to/extension/path/
 * or /usr/share/to/extension/path/
 */
export class CssLoader {
    constructor() {
        log.debug(`create CSS loader`);
    }
}

/**
 * Write CSS fragments to $HOME/.config, $HOME/.local/to/extension/path/
 * or /usr/share/to/extension/path/
 */
export class CssWriter {
    constructor() {
        log.debug(`create CSS writer`);
    }
}