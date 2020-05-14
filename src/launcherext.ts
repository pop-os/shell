const Me = imports.misc.extensionUtils.getCurrentExtension();

const { evaluate } = Me.imports.math.math;
const { spawnCommandLine } = imports.misc.util;

const { Gio, GLib, Soup, St } = imports.gi;

import * as log from 'log';
import * as once_cell from 'once_cell';
import * as widgets from 'widgets';

import type { Ext } from 'extension';
import type { Search } from 'search';
import * as settings from 'settings';

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
        log.info(`${expr} = ${value}`);
        if (!this.search) {
            log.error("init was never called");
        }

        this.search?.set_text(`=${value}`);

        return true;
    }

    search_results(expr: string): Array<St.Widget> | null {
        const icon_size = this.search?.icon_size() ?? DEFAULT_ICON_SIZE;

        const item = new widgets.ApplicationBox(`=${evaluate(expr).toString()}`,
            new St.Icon({
                icon_name: 'x-office-spreadsheet', // looks like calculations?
                icon_size: icon_size / 2,
                style_class: "pop-shell-search-cat"
            }),
            new St.Icon({
                icon_name: 'accessories-calculator',
                icon_size: icon_size
            }));

        return [item.container];
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

class WebResult {
    link: string;
    title: string;
}

export class WebSearchLauncher implements LauncherExtension {
    prefix = 'w:';
    name = 'web-search';
    app_info = Gio.AppInfo.get_default_for_uri_scheme('https');
    ext?: Ext;
    search?: Search;
    results?: WebResult[];
    
    // todo: Add support for async search results
    session = new Soup.SessionSync();

    init(ext: Ext, search: Search): this {
        this.ext = ext;
        this.search = search;

        return this;
    }

    private get_search_uri(): settings.SearchEngine {
        if (!this.ext) {
            log.error('init was not called');
        }

        return this.ext?.settings.search_engine() ?? settings.SearchEngine.DuckDuckGo;
    }

    private get_query(webSearch: string): string {
        const searchBase = this.get_search_uri();
        return searchBase + encodeURIComponent(webSearch);
    }

    apply(webSearch: string): boolean {
        this.app_info?.launch_uris([this.get_query(webSearch)], null);

        return false;
    }

    private fallback_widget(query: string): Array<St.Widget> | null {
        const icon_size = this.search?.icon_size() ?? DEFAULT_ICON_SIZE;
        if (!this.app_info) {
            return null;
        }

        const item = new widgets.ApplicationBox(`${this.app_info.get_display_name()}: ${query}`,
            new St.Icon({
                icon_name: 'application-default-symbolic',
                icon_size: icon_size / 2,
                style_class: "pop-shell-search-cat"
            }),
            new St.Icon({
                gicon: this.app_info.get_icon(),
                icon_size: icon_size
            }));

        return [item.container];
    }

    search_results(webSearch: string): Array<St.Widget> | null {
        const icon_size = this.search?.icon_size() ?? DEFAULT_ICON_SIZE;
        if (!this.app_info) {
            return null;
        }

        const query = this.get_query(webSearch);
        if (this.get_search_uri() !== settings.SearchEngine.DuckDuckGo) {
            return this.fallback_widget(query);
        }

        const msg = Soup.Message.new('GET', query);
        const result = this.session.send_message(msg);
        if (result !== 200) {
            return this.fallback_widget(query);
        }

        const body = msg.response_body.data;
        if (typeof body !== 'string') {
            return this.fallback_widget(query);
        }

        body
    }
} 
