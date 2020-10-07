// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as result from 'result';
import * as error from 'error';
import * as constants from 'constants';

const { Gio, GLib, GObject, Meta } = imports.gi;
const { Ok, Err } = result;
const { Error } = error;
const Util = imports.misc.util;

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

export function open_prefs() {
    // TODO, this does not solve preferences being opened from Tweaks
    let prefs_window = find_window_with_title(constants.PREFS_WINDOW_TITLE);
    if (prefs_window) {
        prefs_window.raise();
        prefs_window.activate(global.get_current_time());
        return;
    }
    Util.spawnCommandLine('gnome-extensions prefs pop-shell@system76.com');
}

export function open_color_dialog() {
    let color_dialog = find_window_with_title(constants.COLOR_DIALOG_WINDOW_TITLE);

    if (color_dialog) {
        color_dialog.raise();
        color_dialog.activate(global.get_current_time());
        return;
    }

    let path = Me.dir.get_path() + "/color_dialog/main.js";
    // NOTE, imports.misc.utils.spawnCommandLine does not work on gjs that waits for Gtk loop to finish, 
    // Use the GLib async spawn instead
    let resp = GLib.spawn_command_line_async(`gjs ${path}`);
    if (!resp) {
        // FIXME, need to handle the journal log segfaults but no impact on PopShell
        return null;
    }
}

export function find_window_with_title(title: string, type: Meta.TabList = Meta.TabList.NORMAL): Meta.Window | undefined {
    let display: Meta.Display = global.display;
    let workspace_manager = display.get_workspace_manager();
    let num_workspaces: number = workspace_manager.get_n_workspaces();

    for (let w_id = 1; w_id <= num_workspaces; w_id++) {
        let workspace = workspace_manager.get_workspace_by_index(w_id);
        for (const window of display.get_tab_list(type, workspace)) {
            if (window.get_title() && title && window.get_title() === title) {
                return window;
            }
        }
    }

    return undefined;
}

/** Utility function for running a process in the background and fetching its standard output as a string. */
export function async_process(argv: Array<string>, input = null, cancellable = null): Promise<string> {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE

    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    let proc = new Gio.Subprocess({
        argv: argv,
        flags: flags
    });
    proc.init(cancellable);

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