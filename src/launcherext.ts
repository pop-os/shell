const Me = imports.misc.extensionUtils.getCurrentExtension();

const { evaluate } = Me.imports.math.math;
const { spawnCommandLine } = imports.misc.util;

const { GLib, St } = imports.gi;

import * as log from 'log';
import * as once_cell from 'once_cell';

import type { Ext } from 'extension';
import type { Search } from 'search';

const DEFAULT_ICON_SIZE = 34;

const TERMINAL = new once_cell.OnceCell<string>();

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
    search_results?: (text: string) => Array<[string, St.Widget, St.Widget]> | null;
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
        log.info(`${expr} = ${value}`);
        if (!this.search) {
            log.error("init was never called");
        }

        this.search?.set_text(`=${value}`);

        return true;
    }

    search_results(expr: string): Array<[string, St.Widget, St.Widget]> | null {
        const icon_size = this.search?.icon_size() ?? DEFAULT_ICON_SIZE;

        const item: [string, St.Widget, St.Widget] =
            [
                `=${evaluate(expr).toString()}`,
                new St.Icon({
                    icon_name: 'x-office-spreadsheet', // looks like calculations?
                    icon_size: icon_size / 2,
                    style_class: "pop-shell-search-cat"
                }),
                new St.Icon({
                    icon_name: 'accessories-calculator',
                    icon_size: icon_size
                })
            ];

        return [item];
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

export class TerminalLauncher implements LauncherExtension {
    prefix = 't:';
    name = 'terminal';

    init(): this {
        return this;
    }

    apply(cmd: string): boolean {
        let terminal = TERMINAL.get_or_init(() => {
            let path: string | null = GLib.find_program_in_path('x-terminal-emulator');
            return path ?? 'gnome-terminal';
        });

        spawnCommandLine(`${terminal} -e sh -c '${cmd}; echo "Press to exit"; read t'`);
        return false;
    }
}

export class WebSearchLauncher implements LauncherExtension {
    prefix = 'w:';
    name = 'web-search';
    ext?: Ext;
    search?: Search;

    init(ext: Ext, search: Search): this {
        this.ext = ext;
        this.search = search;

        return this;
    }

    private get_query(webSearch: string): string {
        const searchBase = this.ext?.settings.search_engine();
        log.info(searchBase ?? 'search engine undefined');
        return searchBase + encodeURIComponent(webSearch);
    }

    apply(webSearch: string): boolean {
        // xdg-open should use user's default browser
        const cmd = `xdg-open "${this.get_query(webSearch)}"`;
        spawnCommandLine(cmd);

        return false;
    }

    search_results(webSearch: string): Array<[string, St.Widget, St.Widget]> | null {
        const icon_size = this.search?.icon_size() ?? DEFAULT_ICON_SIZE;

        const item: [string, St.Widget, St.Widget] =
            [
                `${this.get_query(webSearch)}`,
                new St.Icon({
                    icon_name: 'modem',
                    icon_size: icon_size / 2,
                    style_class: "pop-shell-search-cat"
                }),
                new St.Icon({
                    icon_name: 'system-search',
                    icon_size: icon_size
                })
            ];

        return [item];
    }
} 