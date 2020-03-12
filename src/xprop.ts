// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as lib from 'lib';

const GLib: GLib = imports.gi.GLib;
const { spawn } = imports.misc.util;

export var MOTIF_HINTS: string = '_MOTIF_WM_HINTS';
export var HIDE_FLAGS: string[] = ['0x2', '0x0', '0x2', '0x0', '0x0'];
export var SHOW_FLAGS: string[] = ['0x2', '0x0', '0x1', '0x0', '0x0'];

export function get_window_role(xid: string): string | null {
    let out = xprop_cmd(xid, 'WM_WINDOW_ROLE');

    if (!out) return null;

    return parse_string(out);
}

export function get_hint(xid: string, hint: string): Array<string> | null {
    let out = xprop_cmd(xid, hint);

    if (!out) return null;

    const array = parse_cardinal(out);

    return array ? array.map((value) => value.startsWith('0x') ? value : '0x' + value) : null;
}

export function get_xid(meta: Meta.Window): string | null {
    const desc = meta.get_description();
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

function consume_key(string: string): number | null {
    const pos = string.indexOf('=');
    return -1 == pos ? null : pos;
}

function parse_cardinal(string: string): Array<string> | null {
    const pos = consume_key(string);
    return pos ? string.slice(pos + 1).trim().split(', ') : null;
}

function parse_string(string: string): string | null {
    const pos = consume_key(string);
    return pos ? string.slice(pos + 1).trim().slice(1, -1) : null;
}

function xprop_cmd(xid: string, args: string): string | null {
    let xprops = GLib.spawn_command_line_sync(lib.dbg(`xprop -id ${xid} ${args}`));
    if (!xprops[0]) return null;

    return lib.dbg(imports.byteArray.toString(xprops[1]));
}
