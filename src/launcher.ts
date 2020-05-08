const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, GLib, Meta, St } = imports.gi;
const { spawnCommandLine } = imports.misc.util;

const { evaluate } = Me.imports.math.math;

import * as app_info from 'app_info';
import * as error from 'error';
import * as lib from 'lib';
import * as log from 'log';
import * as once_cell from 'once_cell';
import * as search from 'search';
import * as window from 'window';

import type { ShellWindow } from 'window';
import type { Ext } from './extension';
import type { AppInfo } from './app_info';

const LIST_MAX = 8;
const ICON_SIZE = 34;

let TERMINAL = new once_cell.OnceCell<string>();

const MODES = [':', 't:', '='];

export class Launcher extends search.Search {
    selections: Array<ShellWindow | AppInfo>;
    active: Array<[string, St.Widget, St.Widget]>;
    desktop_apps: Array<AppInfo>;
    mode: number;

    constructor(ext: Ext) {
        let apps = new Array();

        let cancel = () => {
            ext.overlay.visible = false;
        };

        let mode = (id: number) => {
            ext.overlay.visible = false;
            this.mode = id;
        };

        let search = (pattern: string): Array<[string, St.Widget, St.Widget]> | null => {
            this.selections.splice(0);
            this.active.splice(0);
            apps.splice(0);

            if (pattern.length == 0) {
                this.list_workspace(ext);
                return this.active;
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
            for (const info of this.desktop_apps) {
                const retain = contains_pattern(info.name(), needles)
                    || contains_pattern(info.desktop_name, needles)
                    || lib.ok(info.generic_name(), (s) => contains_pattern(s, needles))
                    || lib.ok(info.comment(), (s) => contains_pattern(s, needles))
                    || lib.ok(info.categories(), (s) => contains_pattern(s, needles))
                    || lib.ok(info.executable(), (s) => contains_pattern(s, needles));

                if (retain) {
                    this.selections.push(info);
                }
            }

            // Sort the list of matched selections
            this.selections.sort((a, b) => {
                const a_name = a instanceof window.ShellWindow ? a.name(ext) : a.name();
                const b_name = b instanceof window.ShellWindow ? b.name(ext) : b.name();

                return a_name.toLowerCase() > b_name.toLowerCase() ? 1 : 0;
            });

            // Truncate excess items from the list
            this.selections.splice(LIST_MAX);

            for (const selection of this.selections) {
                let data: [string, St.Widget, St.Widget];

                if (selection instanceof window.ShellWindow) {
                    data = window_selection(ext, selection);
                } else {
                    const app = selection;
                    const generic = app.generic_name();

                    data = [
                        generic ? `${generic} (${app.name()}) [${app.comment()}]` : `${app.name()} [${app.comment()}]`,
                        new St.Icon({
                            icon_name: 'application-default-symbolic',
                            icon_size: ICON_SIZE / 2,
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
            if (this.mode !== -1) return;

            ext.overlay.visible = false;

            if (id >= this.selections.length) return;

            const selected = this.selections[id];
            if (selected instanceof window.ShellWindow) {
                if (selected.workspace_id() == ext.active_workspace()) {
                    const rect = selected.rect();
                    ext.overlay.x = rect.x
                    ext.overlay.y = rect.y;
                    ext.overlay.width = rect.width;
                    ext.overlay.height = rect.height;
                    ext.overlay.visible = true;
                }
            }
        };

        let apply = (id: number | string) => {
            ext.overlay.visible = false;

            if (typeof id === 'number') {
                const selected = this.selections[id];
                if (selected instanceof window.ShellWindow) {
                    selected.activate();
                } else {
                    const result = selected.launch();
                    if (result instanceof error.Error) {
                        log.error(result.format());
                    }
                }
            } else if (id.startsWith('t:')) {
                const cmd = id.slice(2).trim();

                let terminal = TERMINAL.get_or_init(() => {
                    let path: string | null = GLib.find_program_in_path('x-terminal-emulator');
                    return path ?? 'gnome-terminal';
                });

                spawnCommandLine(`${terminal} -e sh -c '${cmd}; echo "Press to exit"; read t'`)
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

        super(MODES, cancel, search, select, apply, mode);

        this.dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout._dialog.x_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout.y = 48;

        this.selections = new Array();
        this.active = new Array();
        this.desktop_apps = new Array();
        this.mode = -1;
    }

    load_desktop_files() {
        lib.bench("load_desktop_files", () => {
            this.desktop_apps.splice(0);
            for (const result of app_info.load_desktop_entries()) {
                const value = result;
                log.info(value.display());
                this.desktop_apps.push(value);
            }
        });
    }

    list_workspace(ext: Ext) {
        let show_all_workspaces = true;
        const active = ext.active_workspace();
        for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
            if (show_all_workspaces || window.workspace_id() === active) {
                this.selections.push(window);

                this.active.push(window_selection(ext, window));

                if (this.selections.length == LIST_MAX) break;
            }
        }
    }

    open(ext: Ext) {
        const mon = ext.monitor_work_area(ext.active_monitor());

        this.active.splice(0);
        this.selections.splice(0);
        this.clear();

        this.dialog.dialogLayout.x = (mon.width / 2) - (this.dialog.dialogLayout.width / 2);
        this.dialog.dialogLayout.y = (mon.height / 2) - (this.dialog.dialogLayout.height);

        this.list_workspace(ext);
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
            icon_size: ICON_SIZE / 2,
            style_class: "pop-shell-search-cat"
        }),
        window.icon(ext, ICON_SIZE)
    ];
}
