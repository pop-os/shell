//@ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, GLib, Meta, St } = imports.gi;

import * as app_info from 'app_info';
import * as error from 'error';
import * as lib from 'lib';
import * as log from 'log';
import * as result from 'result';
import * as search from 'search';
import * as window from 'window';
import * as launchers from 'launcherext';
import * as widgets from 'widgets';

import type { ShellWindow } from 'window';
import type { Ext } from 'extension';
import type { AppInfo } from 'app_info';

const { OK } = result;

const HOME_DIR: string = GLib.get_home_dir();

/// Search paths for finding applications
const SEARCH_PATHS: Array<[string, string]> = [
    // System-wide
    ["System", "/usr/share/applications/"],
    ["System-Local", "/usr/local/share/applications/"],
    // User-local
    ["Local", HOME_DIR + "/.local/share/applications/"],
    // System-wide flatpaks
    ["Flatpak (system)", "/var/lib/flatpak/exports/share/applications/"],
    // User-local flatpaks
    ["Flatpak", HOME_DIR + "/.local/share/flatpak/exports/share/applications/"],
    // System-wide Snaps
    ["Snap (system)", "/var/lib/snapd/desktop/applications/"]
];

const MODES: launchers.LauncherExtension[] = [
    new launchers.TerminalLauncher(),
    new launchers.CommandLauncher(),
    new launchers.CalcLauncher(),
    new launchers.WebSearchLauncher()
];

export class Launcher extends search.Search {
    selections: Array<ShellWindow | [string, AppInfo]>;
    active: Array<St.Widget>;
    desktop_apps: Array<[string, AppInfo]>;
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

        let search = (pattern: string): Array<St.Widget> | null => {
            this.selections.splice(0);
            this.active.splice(0);
            apps.splice(0);

            if (this.mode !== -1) {
                const launcher = MODES[this.mode].init(ext, this);
                const results = launcher.search_results?.(pattern.slice(launcher.prefix.length).trim()) ?? null;
                results?.forEach(result => {
                    this.active.push(result);
                });

                return this.active;
            }

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
            this.selections.splice(this.list_max());

            for (const selection of this.selections) {
                let data: St.Widget;

                if (selection instanceof window.ShellWindow) {
                    data = window_selection(ext, selection, this.icon_size());
                } else {
                    const [where, app] = selection;
                    const generic = app.generic_name();

                    data = new widgets.ApplicationBox(generic ? `${generic} (${app.name()}) [${where}]` : `${app.name()} [${where}]`,
                        new St.Icon({
                            icon_name: 'application-default-symbolic',
                            icon_size: this.icon_size() / 2,
                            style_class: "pop-shell-search-cat"
                        }),
                        new St.Icon({
                            icon_name: app.icon() ?? 'applications-other',
                            icon_size: this.icon_size()
                        })).container;
                }

                this.active.push(data);
            }

            if (this.active.length > 0) {
                return this.active;
            } else {
                return (new launchers.WebSearchLauncher()).init(ext, this).search_results(pattern);
            }
        };

        let select = (id: number) => {
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

        let apply = (text: string, index: number) => {
            ext.overlay.visible = false;

            if (this.mode === -1 && this.selections.length > 0) {
                const selected = this.selections[index];
                if (selected instanceof window.ShellWindow) {
                    selected.activate();
                } else {
                    const result = selected[1].launch();
                    if (result instanceof error.Error) {
                        log.error(result.format());
                    }
                }

                return false;
            }

            const launcher = (this.mode >= 0) ? MODES[this.mode] : new launchers.WebSearchLauncher();
            launcher.init(ext, this);
            log.info(`Launcher Extension: "${launcher.name}"`);
            const input = text.startsWith(launcher.prefix) ? text.slice(launcher.prefix.length).trim() : text;
            return launcher.apply(input, index);
        };

        super(MODES.map(mode => mode.prefix), cancel, search, select, apply, mode);

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

    list_workspace(ext: Ext) {
        let show_all_workspaces = true;
        const active = ext.active_workspace();
        for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
            if (show_all_workspaces || window.workspace_id() === active) {
                this.selections.push(window);

                this.active.push(window_selection(ext, window, this.icon_size()));

                if (this.selections.length == this.list_max()) break;
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

function window_selection(ext: Ext, window: ShellWindow, icon_size: number): St.Widget {
    let name = window.name(ext);
    let title = window.meta.get_title();

    if (name != title) {
        name += ': ' + title;
    }

    return new widgets.ApplicationBox(
        name,
        new St.Icon({
            icon_name: 'focus-windows-symbolic',
            icon_size: icon_size / 2,
            style_class: "pop-shell-search-cat"
        }),
        window.icon(ext, icon_size)).container;
}
