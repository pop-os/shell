const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GLib, Meta, St } = imports.gi;

const { evaluate } = Me.imports.math.math;

import * as app_info from 'app_info';
import * as error from 'error';
import * as lib from 'lib';
import * as log from 'log';
import * as search from 'search';
import * as window from 'window';

import type { ShellWindow } from 'window';
import type { Ext } from './extension';
import type { AppInfo } from './app_info';

const HOME_DIR: string = GLib.get_home_dir();

const LIST_MAX = 5;
const ICON_SIZE = 32;

/// Search paths for finding applications
const SEARCH_PATHS: Array<[string, string]> = [
    // System-wide
    ["System", "/usr/share/applications/"],
    // User-local
    ["Local", HOME_DIR + "/.local/share/applications/"],
    // System-wide flatpaks
    ["Flatpak (system)", "/var/lib/flatpak/exports/share/applications/"],
    // User-local flatpaks
    ["Flatpak", HOME_DIR + "/.local/share/flatpak/exports/share/applications/"]
];

export class Launcher extends search.Search {
    selections: Array<ShellWindow | [string, AppInfo]>;
    active: Array<[string, any, any]>;
    desktop_apps: Array<[string, AppInfo]>;

    constructor(ext: Ext) {
        let apps = new Array();

        let cancel = () => {
            ext.overlay.visible = false;
        };

        let search = (pattern: string): Array<[string, any, any]> | null => {
            this.selections.splice(0);
            this.active.splice(0);
            apps.splice(0);

            if (pattern.length == 0) {
                ext.overlay.visible = false;
                return null;
            }

            const needles = pattern.split(' ');

            const contains_pattern = (haystack: string, needles: Array<string>): boolean => {
                const hay = haystack.toLowerCase();
                return needles.every((n) => hay.includes(n));
            };

            // Filter matching windows
            for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
                const retain = contains_pattern(window.name(ext), needles)
                    || contains_pattern(window.meta.get_title(), needles);

                if (retain) {
                    this.selections.push(window);
                }
            }

            // Filter matching desktop apps
            for (const [where, info] of this.desktop_apps) {
                const retain = contains_pattern(info.name(), needles)
                    || contains_pattern(info.desktop_name, needles)
                    || lib.ok(info.generic_name(), (s) => contains_pattern(s, needles))
                    || lib.ok(info.comment(), (s) => contains_pattern(s, needles))
                    || lib.ok(info.categories(), (s) => contains_pattern(s, needles));

                if (retain) {
                    this.selections.push([where, info]);
                }
            }

            // Sort the list of matched selections
            this.selections.sort((a, b) => {
                const a_name = a instanceof window.ShellWindow ? a.name(ext) : a[1].name();
                const b_name = b instanceof window.ShellWindow ? b.name(ext) : b[1].name();

                return a_name.toLowerCase() > b_name.toLowerCase() ? 1 : 0;
            });

            // Truncate excess items from the list
            this.selections.splice(LIST_MAX);

            for (const selection of this.selections) {
                let data: [string, any, any];

                if (selection instanceof window.ShellWindow) {
                    let name = selection.name(ext);
                    let title = selection.meta.get_title();

                    if (name != title) {
                        name += ': ' + title;
                    }

                    data = [
                        name,
                        new St.Icon({
                            icon_name: 'focus-windows-symbolic',
                            icon_size: ICON_SIZE - 12,
                            style_class: "pop-shell-search-cat"
                        }),
                        selection.icon(ext, ICON_SIZE)
                    ];
                } else {
                    const [where, app] = selection;
                    const generic = app.generic_name();

                    data = [
                        generic ? `${generic} (${app.name()}) [${where}]` : `${app.name()} [${where}]`,
                        new St.Icon({
                            icon_name: 'applications-other',
                            icon_size: ICON_SIZE - 12,
                            style_class: "pop-shell-search-cat"
                        }),
                        new St.Icon({
                            icon_name: app.icon() ?? 'applications-other',
                            icon_size: ICON_SIZE
                        })
                    ];
                }

                this.active.push(data);
            }

            return this.active;
        };

        let select = (id: number) => {
            if (id <= this.selections.length) return;

            const selected = this.selections[id];
            if (selected instanceof window.ShellWindow) {
                const rect = selected.rect();
                ext.overlay.x = rect.x
                ext.overlay.y = rect.y;
                ext.overlay.width = rect.width;
                ext.overlay.height = rect.height;
                ext.overlay.visible = true;
            }
        };

        let apply = (id: number | string) => {
            if (typeof id === 'number') {
                const selected = this.selections[id];
                if (selected instanceof window.ShellWindow) {
                    selected.activate();
                    ext.overlay.visible = false;
                } else {
                    const result = selected[1].launch();
                    if (result instanceof error.Error) {
                        log.error(result.format());
                    }
                }
            } else if (id.startsWith(':')) {
                let cmd = id.slice(1).trim();
                cmd = cmd.startsWith('sudo ')
                    ? `x-terminal-emulator -e sh -c '${cmd}'`
                    : cmd;
                imports.misc.util.spawnCommandLine(cmd);
            } else if (id.startsWith('=')) {
                const expr = id.slice(1).trim();
                const value: string = evaluate(expr).toString();
                log.info(`${expr} = ${value}`);
                this.set_text('= ' + value);
                return true;
            }

            return false;
        };

        super([':','='], cancel, search, select, apply);
        this.selections = new Array();
        this.active = new Array();
        this.desktop_apps = new Array();
    }

    load_desktop_files() {
        lib.bench("load_desktop_files", () => {
            this.desktop_apps.splice(0);
            for (const [where, path] of SEARCH_PATHS) {
                for (const result of app_info.load_desktop_entries(path)) {
                    if (result instanceof app_info.AppInfo) {
                        log.info(result.display());
                        this.desktop_apps.push([where, result]);
                    } else {
                        log.error(result.context(`failed to load desktop app`).format());
                    }
                }
            }
        });
    }
}
