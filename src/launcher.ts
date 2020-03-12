const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, GLib, Meta, St } = imports.gi;
const { spawnCommandLine } = imports.misc.util;

const { evaluate } = Me.imports.math.math;

import * as app_info from 'app_info';
import * as error from 'error';
import * as lib from 'lib';
import * as log from 'log';
import * as result from 'result';
import * as search from 'search';
import * as window from 'window';

import type { ShellWindow } from 'window';
import type { Ext } from './extension';
import type { AppInfo } from './app_info';


const { OK } = result;

const HOME_DIR: string = GLib.get_home_dir();

const LIST_MAX = 10;
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
    active: Array<[string, St.Widget, St.Widget]>;
    desktop_apps: Array<[string, AppInfo]>;

    constructor(ext: Ext) {
        let apps = new Array();

        let cancel = () => {
            ext.overlay.visible = false;
        };

        let search = (pattern: string): Array<[string, St.Widget, St.Widget]> | null => {
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
                let data: [string, St.Widget, St.Widget];

                if (selection instanceof window.ShellWindow) {
                    data = window_selection(ext, selection);
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
            if (id >= this.selections.length) return;

            const selected = this.selections[id];
            if (selected instanceof window.ShellWindow) {
                const rect = selected.rect();
                ext.overlay.x = rect.x
                ext.overlay.y = rect.y;
                ext.overlay.width = rect.width;
                ext.overlay.height = rect.height;
                ext.overlay.visible = selected.workspace_id() == ext.active_workspace();
            } else {
                ext.overlay.visible = false;
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
            } else if (id.startsWith('t:')) {
                const cmd = id.slice(2).trim();
                spawnCommandLine(`x-terminal-emulator -e sh -c '${cmd}; echo "Press to exit"; read t'`)
            } else if (id.startsWith(':')) {
                const cmd = id.slice(1).trim();
                spawnCommandLine(cmd);
            } else if (id.startsWith('=')) {
                const expr = id.slice(1).trim();
                const value: string = evaluate(expr).toString();
                log.info(`${expr} = ${value}`);
                this.set_text('= ' + value);
                return true;
            }

            return false;
        };

        super([':', 't:', '='], cancel, search, select, apply);

        this.dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout._dialog.x_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout.y = 48;

        this.selections = new Array();
        this.active = new Array();
        this.desktop_apps = new Array();
    }

    load_desktop_files() {
        lib.bench("load_desktop_files", () => {
            this.desktop_apps.splice(0);
            for (const [where, path] of SEARCH_PATHS) {
                for (const result of app_info.load_desktop_entries(path)) {
                    if (result.kind == OK) {
                        const value = result.value;
                        log.info(value.display());
                        this.desktop_apps.push([where, value]);
                    } else {
                        const why = result.value;
                        log.warn(why.context(`failed to load desktop app`).format());
                    }
                }
            }
        });
    }

    open(ext: Ext) {
        const mon = ext.monitor_work_area(ext.active_monitor());
        const active = ext.active_workspace();
        this.active.splice(0);

        this.dialog.dialogLayout.x = (mon.width / 2) - (this.dialog.dialogLayout.width / 2);

        for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
            if (window.workspace_id() == active) {
                this.selections.push(window);

                this.active.push(window_selection(ext, window));

                if (this.selections.length == LIST_MAX) break;
            }
        }

        this.update_search_list(this.active);

        this.dialog.open(global.get_current_time(), false);
    }
}

function window_selection(ext: Ext, window: ShellWindow): [string, St.Widget, St.Widget] {
    let name = window.name(ext);
    let title = window.meta.get_title();

    if (name != title) {
        name += ': ' + title;
    }

    return [
        name,
        new St.Icon({
            icon_name: 'focus-windows-symbolic',
            icon_size: ICON_SIZE - 12,
            style_class: "pop-shell-search-cat"
        }),
        window.icon(ext, ICON_SIZE)
    ];
}
