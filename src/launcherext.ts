const Me = imports.misc.extensionUtils.getCurrentExtension();

const { evaluate } = Me.imports.math.math;
const { spawnCommandLine } = imports.misc.util;
const { ByteArray } = imports.byteArray;
const { GLib, Gtk, St } = imports.gi;

import * as log from 'log';
import * as utils from 'utils';
import * as once_cell from 'once_cell';
import * as widgets from 'widgets';

import type { Ext } from 'extension';
import type { Search } from 'search';

const DEFAULT_ICON_SIZE = 34;

const TERMINAL = new once_cell.OnceCell<[string, string]>();

const HOME_DIR: string = GLib.get_home_dir();

export type LauncherExtension = {
    // Mode Prefix for launcher
    prefix: string;

    // Name for debugging
    name: string;

    /**
     * Initializes the launcher extension
     * @param ext Extension settings
     * @param search Launcher instance
     */
    init(ext: Ext, search: Search): LauncherExtension;

    /**
     * Perform apply action
     * @param text The currently typed text in input minus the launcher extension prefix
     * @param index The currently selected index
     * @returns true to keep showing the launcher after apply, false to dismiss launcher
     */
    apply(text: string, index: number): boolean;

    /**
     * Gets search results from the launcher extension if search is supported
     * @param text The currently typed text in input
     * @returns An array of tuples containing string to display
     */
    search_results?: (text: string) => Array<St.Widget> | null;
}

export class CalcLauncher implements LauncherExtension {
    prefix = '=';
    name = 'calc';
    ext?: Ext;
    search?: Search;

    init(ext: Ext, search: Search): this {
        this.ext = ext;
        this.search = search;

        return this;
    }

    apply(expr: string): boolean {
        const value: string = evaluate(expr).toString();

        if (!this.search) {
            log.error("init was never called");
        }

        this.search?.set_text(`=${value}`);

        return true;
    }

    search_results(expr: string): Array<St.Widget> | null {
        if (expr.length === 0) return null;

        let out: string;

        try {
            out = '= ' + evaluate(expr).toString();
        } catch (e) {
            out = expr + ' x = ?'
        }

        const icon_size = this.search?.icon_size() ?? DEFAULT_ICON_SIZE;

        return [
            widgets.application_button(
                out,
                new St.Icon({
                    icon_name: 'x-office-spreadsheet', // looks like calculations?
                    icon_size: icon_size / 2,
                    style_class: "pop-shell-search-cat"
                }),
                new St.Icon({
                    icon_name: 'accessories-calculator',
                    icon_size: icon_size
                }))
        ];
    }
}

export class CommandLauncher implements LauncherExtension {
    prefix = ':';
    name = 'command';

    init(): this {
        return this;
    }

    apply(cmd: string): boolean {
        spawnCommandLine(cmd);
        return false;
    }
}

type RecentItem = {
    display_name: string;
    icon: any;
    uri: string;
}

export class RecentDocumentLauncher implements LauncherExtension {
    search?: Search;
    prefix = 'd:';
    name = 'recent docs';
    recent_manager = Gtk.RecentManager.get_default();
    results?: Array<RecentItem>;

    init(_: Ext, search: Search): this {
        this.search = search;
        return this;
    }

    apply(_: string, index: number): boolean {
        if (!this.results) { return false; }
        const uri = this.results[index].uri;
        const cmd = `xdg-open ${uri}`;
        spawnCommandLine(cmd);
        return false;
    }

    items(): Array<RecentItem> | undefined {
        const recent_items = this.recent_manager.get_items();
        if (!recent_items) { return undefined; }
        const items: Array<RecentItem> = recent_items.filter((item: any): boolean => item.exists()).map((item: any): RecentItem => {
            return {
                display_name: item.get_display_name(),
                icon: item.get_gicon(),
                uri: item.get_uri()
            };
        });

        return items;
    }

    search_results(query: string): Array<St.Widget> | null {
        const items = this.items();
        if (!items) { return null; }
        if (!this.search) {
            log.error('init not called before performing search');
            return null;
        }

        const normalized_query = query.toLowerCase();
        this.results = items.filter(item => item.display_name.toLowerCase().includes(normalized_query) || item.uri.toLowerCase().includes(normalized_query)).slice(0, this.search.list_max()).sort((a, b) => a.display_name.localeCompare(b.display_name));
        return this.results.map((item): St.Widget => widgets.application_button(`${item.display_name}: ${decodeURI(item.uri)}`,
            new St.Icon({
                icon_name: 'system-file-manager',
                icon_size: (this.search?.icon_size() ?? DEFAULT_ICON_SIZE) / 2,
                style_class: "pop-shell-search-cat"
            }), new St.Icon({
                gicon: item.icon,
                icon_size: this.search?.icon_size() ?? DEFAULT_ICON_SIZE
            })));
    }
}

export class TerminalLauncher implements LauncherExtension {
    prefix = 't:';
    name = 'terminal';

    init(): this {
        return this;
    }

    apply(cmd: string): boolean {
        let [terminal, splitter] = TERMINAL.get_or_init(() => {
            let path: string | null = GLib.find_program_in_path('x-terminal-emulator');
            return path ? [path, "-e"] : ["gnome-terminal", "--"];
        });

        spawnCommandLine(`${terminal} ${splitter} sh -c '${cmd}; echo "Press to exit"; read t'`);
        return false;
    }
}

export class ExternalLauncher implements LauncherExtension {    
    prefix = '.';
    name = 'launch external';

    ext?: Ext;
    search?: Search;
    results?: Array<RecentItem>;
    cache?: any = null;

    get_sesid(): number {
        if (this.search)
            return this.search.get_session_id();

        return 0;
    }

    get_cmd(query: string): any {
        if (!query) { return null; }

        const arr: Array<String> = query.split(/\s+/);
        if (arr.length < 1) { return null; }

        const action_str = HOME_DIR + '/.pop-shell-launchers/' + arr[0];

        if (!utils.exists(action_str)) {
            return false;
        }

        const query_str: string = query.substring(arr[0].length + 1);

        return {action: action_str, query: query_str, tag: this.get_sesid()}
    }

    init(ext: Ext, search: Search): this {
        this.ext = ext;
        this.search = search;

        if (!this.cache) {
            this.cache = {tag: 0, action: "", items: new Array<RecentItem>()};
        }

        return this;
    }

    apply(query: string, index: number): boolean {
        if (!this.results) { return false; }

        const cmd = this.get_cmd(query);
        if (!cmd) { return false; }

        const uri = this.results[index].uri;
        const display_name = this.results[index].display_name;

        spawnCommandLine(`${cmd.action} ${cmd.tag} apply ${uri} "${display_name}"`);

        return false;
    }

    items(cmd: any): Array<RecentItem> | undefined {
        if (this.cache?.tag == cmd.tag && this.cache?.action == cmd.action) {
            return this.cache?.items;
        }

        let items = undefined;

        // This started out, as an async method, but I couldn't figure out howto make search_results async.        
        let [result, stdout, stderr, exit] = GLib.spawn_command_line_sync(`${cmd.action} ${cmd.tag} list`);

        if (result) {
            if (stderr && stderr.length > 0) {
                const str: string = new ByteArray(stderr).toString();
                log.error(`ExternalLauncher: error, exitcode ${exit}, message ${str}`);
            } else if (stdout && stdout.length > 0) {
                const str: string = new ByteArray(stdout).toString();

                items = str.trim().split(/\r?\n/).map((line: string): RecentItem => {
                    const arr = line.split(/\t/);
                    return {
                        display_name: arr[1],
                        icon: arr.length > 2 ? arr[2] : 'applications-internet',
                        uri: arr[0]
                    };
                });
            } else {
                log.error(`ExternalLauncher: undefined error, exitcode ${exit}`);
            }
        } else {
            log.error('ExternalLauncher: unexpected error, spawn_command_line_sync failed');
        }

        this.cache.tag = cmd.tag;
        this.cache.action = cmd.action;
        this.cache.items = items;
        
        return items;
    }

    search_results(query: string): Array<St.Widget> | null {
        if (!this.search) {
            log.error('ExternalLauncher: init not called before performing search');
            return null;
        }

        const cmd = this.get_cmd(query);
        if (!cmd) { return null; }

        const items = this.items(cmd);
        if (!items) { return null; }

        const normalized_query = cmd.query.toLowerCase();
        this.results = items.filter(item => item.display_name.toLowerCase().includes(normalized_query) || item.uri.toLowerCase().includes(normalized_query)).slice(0, this.search.list_max()).sort((a, b) => a.display_name.localeCompare(b.display_name));
        return this.results.map((item): St.Widget => widgets.application_button(`${item.display_name}: ${decodeURI(item.uri)}`,
            new St.Icon({
                icon_name: 'focus-windows-symbolic',
                icon_size: (this.search?.icon_size() ?? DEFAULT_ICON_SIZE) / 2,
                style_class: "pop-shell-search-cat"
            }), new St.Icon({
                icon_name: item.icon,
                icon_size: (this.search?.icon_size() ?? DEFAULT_ICON_SIZE) / 2,
            })));
    }
}
