const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as lib from 'lib';

const { GLib } = imports.gi;
const { spawn } = imports.misc.util;

export var MOTIF_HINTS: string = '_MOTIF_WM_HINTS';
export var HIDE_FLAGS: string[] = ['0x2', '0x0', '0x2', '0x0', '0x0'];
export var SHOW_FLAGS: string[] = ['0x2', '0x0', '0x1', '0x0', '0x0'];

export function get_hint(xid: string, hint: string): Array<string> | null {
    let xprops = GLib.spawn_command_line_sync(lib.dbg(`xprop -id ${xid} ${hint}`));

    if (!xprops[0]) return null;

    let string: string = imports.byteArray.toString(xprops[1]);

    let pos = string.indexOf('=');
    if (-1 == pos) {
        return null;
    }

    return string.slice(pos + 1)
        .trim()
        .split(', ')
        .map((value) => value.startsWith('0x') ? value : '0x' + value);
}

export function get_xid(meta: any): string | null {
    const desc: string = meta.get_description();
    const match = desc && desc.match(/0x[0-9a-f]+/);
    return match && match[0];
}

export function may_decorate(xid: string): boolean {
    const hints = motif_hints(xid);
    return hints ? hints[2] != '0x0' : false;
}

export function motif_hints(xid: string): Array<string> | null {
    return get_hint(xid, '_MOTIF_WM_HINTS');
}

export function set_hint(xid: string, hint: string, value: string[]) {
    spawn(['xprop', '-id', xid, '-f', hint, '32c', '-set', hint, value.join(', ')]);
}
