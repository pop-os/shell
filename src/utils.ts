// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as result from 'result';
import * as error from 'error';
import * as log from 'log';

const { Gio, GLib, GObject, Meta } = imports.gi;
const { Ok, Err } = result;
const { Error } = error;

export function is_wayland(): boolean {
    return Meta.is_wayland_compositor();
}

export function block_signal(object: GObject.Object, signal: SignalID) {
    GObject.signal_handler_block(object, signal);
}

export function unblock_signal(object: GObject.Object, signal: SignalID) {
    GObject.signal_handler_unblock(object, signal);
}

export function read_to_string(path: string): result.Result<string, error.Error> {
    const file = Gio.File.new_for_path(path);
    try {
        const [ok, contents,] = file.load_contents(null);
        if (ok) {
            return Ok(imports.byteArray.toString(contents));
        } else {
            return Err(new Error(`failed to load contents of ${path}`));
        }
    } catch (e) {
        return Err(
            new Error(String(e))
                .context(`failed to load contents of ${path}`)
        );
    }
}

export function source_remove(id: SignalID): boolean {
    return GLib.source_remove(id);
}

export function exists(path: string): boolean {
    return Gio.File.new_for_path(path).query_exists(null);
}

/**
 * Parse the current background color's darkness
 * https://stackoverflow.com/a/41491220 - the advanced solution
 * @param color - the RGBA or hex string value
 */
export function is_dark(color: string): boolean {
    // 'rgba(251, 184, 108, 1)' - pop orange!
    let color_val = "";
    let r = 255;
    let g = 255;
    let b = 255;

    // handle rgba(255,255,255,1.0) format
    if (color.indexOf('rgb') >= 0) {
        // starts with parsed value from Gdk.RGBA
        color = color.replace('rgba', 'rgb')
            .replace('rgb(', '')
            .replace(')', ''); // make it 255, 255, 255, 1
        // log.debug(`util color: ${color}`);
        let colors = color.split(',');
        r = parseInt(colors[0].trim());
        g = parseInt(colors[1].trim());
        b = parseInt(colors[2].trim());
    } else if (color.charAt(0) === '#') {
        color_val = color.substring(1, 7);
        r = parseInt(color_val.substring(0, 2), 16); // hexToR
        g = parseInt(color_val.substring(2, 4), 16); // hexToG
        b = parseInt(color_val.substring(4, 6), 16); // hexToB
    }

    let uicolors = [r / 255, g / 255, b / 255];
    let c = uicolors.map((col) => {
        if (col <= 0.03928) {
            return col / 12.92;
        }
        return Math.pow((col + 0.055) / 1.055, 2.4);
    });
    let L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
    return (L <= 0.179);
}

/** Utility function for running a process in the background and fetching its standard output as a string. */
export function async_process(argv: Array<string>, input = null, cancellable: null | any = null): Promise<string> {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE

    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    let proc = new Gio.Subprocess({ argv, flags });
    proc.init(cancellable);

    proc.wait_async(null, (source: any, res: any) => {
        source.wait_finish(res)
        if (cancellable !== null) {
            cancellable.cancel()
        }
    })

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(input, cancellable, (proc: any, res: any) => {
            try {
                let bytes = proc.communicate_utf8_finish(res)[1];
                resolve(bytes.toString());
            } catch (e) {
                reject(e);
            }
        });
    });
}

export type AsyncIPC = {
    child: any,
    stdout: any,
    stdin: any,
    cancellable: any
}

export function async_process_ipc(argv: Array<string>): AsyncIPC | null {
    const { SubprocessLauncher, SubprocessFlags } = Gio;

    const launcher = new SubprocessLauncher({
        flags: SubprocessFlags.STDIN_PIPE
            | SubprocessFlags.STDOUT_PIPE
    })

    let child: any

    let cancellable = new Gio.Cancellable()

    try {
        child = launcher.spawnv(argv)
    } catch (why) {
        log.error(`failed to spawn ${argv}: ${why}`)
        return null
    }

    let stdin = new Gio.DataOutputStream({
        base_stream: child.get_stdin_pipe(),
        close_base_stream: true
    })

    let stdout = new Gio.DataInputStream({
        base_stream: child.get_stdout_pipe(),
        close_base_stream: true
    })

    child.wait_async(null, (source: any, res: any) => {
        source.wait_finish(res)
        cancellable.cancel()
    })

    return { child, stdin, stdout, cancellable }
}

export function map_eq<K, V>(map1: Map<K, V>, map2: Map<K, V>) {
    if (map1.size !== map2.size) {
        return false
    }

    let cmp

    for (let [key, val] of map1) {
        cmp = map2.get(key)
        if (cmp !== val || (cmp === undefined && !map2.has(key))) {
            return false
        }
    }

    return true
}

export function os_release(): null | string {
    const [ok, bytes] = GLib.file_get_contents("/etc/os-release")
    if (! ok) return null

    const contents: string = imports.byteArray.toString(bytes)
    for (const line of contents.split('\n')) {
        if (line.startsWith("VERSION_ID")) {
            return line.split('"')[1]
        }
    }

    return null
}
