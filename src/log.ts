import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// simplified log4j levels
export enum LOG_LEVELS {
    OFF,
    ERROR,
    WARN,
    INFO,
    DEBUG,
}

/**
 * parse level at runtime so we don't have to restart popshell
 */
export function log_level() {
    // log.js is at the level of prefs.js where the popshell Ext instance
    // is not yet available or visible, so we have to use the built in
    // ExtensionUtils to get the current settings
    let settings = Extension.lookupByURL(import.meta.url).getSettings();
    let log_level = settings.get_uint('log-level');

    return log_level;
}

export function log(text: string) {
    (globalThis as any).log('pop-shell: ' + text);
}

export function error(text: string) {
    if (log_level() > LOG_LEVELS.OFF) log('[ERROR] ' + text);
}

export function warn(text: string) {
    if (log_level() > LOG_LEVELS.ERROR) log('[WARN] ' + text);
}

export function info(text: string) {
    if (log_level() > LOG_LEVELS.WARN) log('[INFO] ' + text);
}

export function debug(text: string) {
    if (log_level() > LOG_LEVELS.INFO) log('[DEBUG] ' + text);
}
