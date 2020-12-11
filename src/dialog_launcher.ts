//@ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Clutter, Gio, GLib, Meta } = imports.gi;

import * as app_info from 'app_info';
import * as error from 'error';
import * as lib from 'lib';
import * as log from 'log';
import * as result from 'result';
import * as search from 'dialog_search';
import * as launch from 'launcher';

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

export class Launcher extends search.Search {
    options: Array<launch.SearchOption>
    desktop_apps: Array<[string, AppInfo]>
    service: launch.LauncherService
    last_plugin: null | launch.Plugin.Source
    mode: number;

    constructor(ext: Ext) {
        let cancel = () => {
            ext.overlay.visible = false;
            this.stop_services()
        };

        let search = (pattern: string): Array<launch.SearchOption> | null => {
            this.options.splice(0)

            if (pattern.length == 0) {
                this.list_workspace(ext);
                return this.options
            }

            this.last_plugin = null

            this.service.query(pattern, (plugin, response) => {
                if (!this.last_plugin) this.last_plugin = plugin;

                if (response.event === "queried") {
                    for (const selection of response.selections) {
                        let icon = null
                        if (selection.icon) {
                            icon = { name: selection.icon }
                        } else if (selection.content_type) {
                            icon = { gicon: Gio.content_type_get_icon(selection.content_type) }
                        }

                        this.options.push(new launch.SearchOption(
                            selection.name,
                            selection.description,
                            plugin.config.icon,
                            icon,
                            this.icon_size(),
                            { plugin, id: selection.id }
                        ))
                    }
                }
            })

            const needles = pattern.toLowerCase().split(' ');

            const contains_pattern = (haystack: string, needles: Array<string>): boolean => {
                const hay = haystack.toLowerCase();
                return needles.every((n) => hay.includes(n));
            };

            let apps: Array<launch.SearchOption> = new Array();

            // Filter matching windows
            for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
                const retain = contains_pattern(window.name(ext), needles)
                    || contains_pattern(window.meta.get_title(), needles);

                if (retain) {
                    apps.push(window_selection(ext, window, this.icon_size()))
                }
            }

            // Filter matching desktop apps
            for (const [where, app] of this.desktop_apps) {
                const retain = contains_pattern(app.name(), needles)
                    || contains_pattern(app.desktop_name, needles)
                    || lib.ok(app.generic_name(), (s) => contains_pattern(s, needles))
                    || lib.ok(app.comment(), (s) => contains_pattern(s, needles))
                    || lib.ok(app.categories(), (s) => contains_pattern(s, needles));

                if (retain) {
                    const generic = app.generic_name();

                    apps.push(new launch.SearchOption(
                        generic ? `${generic} (${app.name()}) [${where}]` : `${app.name()} [${where}]`,
                        null,
                        'application-default-symbolic',
                        { gicon: app.icon() },
                        this.icon_size(),
                        { app }
                    ))
                }
            }

            // Sort the list of matched selections
            apps.sort((a, b) => {
                const a_name = a.title.toLowerCase();
                const b_name = b.title.toLowerCase();

                const pattern_lower = pattern.toLowerCase()

                const a_includes = a_name.includes(pattern_lower);
                const b_includes = b_name.includes(pattern_lower);

                return ((a_includes && b_includes) || (!a_includes && !b_includes)) ? (a_name > b_name ? 1 : 0) : a_includes ? -1 : b_includes ? 1 : 0;
            });

            for (const app of apps) this.options.push(app)

            // Truncate excess items from the list
            this.options.splice(this.list_max());

            return this.options;
        };

        let select = (id: number) => {
            ext.overlay.visible = false

            if (id >= this.options.length) return

            const selected = this.options[id]
            if (selected) {
                if ("window" in selected.id) {
                    const win = selected.id.window
                    if (win.workspace_id() == ext.active_workspace()) {
                        const { x, y, width, height } = win.rect()
                        ext.overlay.x = x
                        ext.overlay.y = y
                        ext.overlay.width = width
                        ext.overlay.height = height
                        ext.overlay.visible = true
                    }
                }
            }
        };

        let apply = (index: number): boolean => {
            ext.overlay.visible = false;

            const selected = this.options[index];

            if (typeof selected === 'undefined') {
                return true
            }

            const option = selected.id

            if ("window" in option) {
                option.window.activate()
            } else if ("app" in option) {
                const result = option.app.launch()
                if (result instanceof error.Error) {
                    log.error(result.format());
                } else {
                    let exec_name = option.app.app_info.get_executable();
                    if (exec_name === "gnome-control-center") {
                        for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
                            if (window.meta.get_title() === "Settings") {
                                window.meta.activate(global.get_current_time());
                                break;
                            }
                        }
                    }
                }
            } else if ("plugin" in option) {
                const { plugin, id } = option
                launch.Plugin.submit(plugin, id)

                const response = launch.Plugin.listen(plugin)
                if (response) {
                    if (response.event === "fill") {
                        this.set_text(response.text)
                        return true
                    }
                }

            }

            return false
        };

        let complete = () => {
            if (this.last_plugin) {
                launch.Plugin.complete(this.last_plugin)
                const res = launch.Plugin.listen(this.last_plugin)
                if (res && res.event === "fill") {
                    this.set_text(res.text)
                }
            }
        }

        super(cancel, search, complete, select, apply);

        this.dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout._dialog.x_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout.y = 48;

        this.service = new launch.LauncherService()
        this.last_plugin = null
        this.options = new Array()
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
                this.options.push(window_selection(ext, window, this.icon_size()))
                if (this.options.length == this.list_max()) break;
            }
        }
    }

    open(ext: Ext) {
        const mon = ext.monitor_work_area(ext.active_monitor());

        this.options.splice(0);
        this.clear();

        this.dialog.dialogLayout.x = (mon.width / 2) - (this.dialog.dialogLayout.width / 2);
        this.dialog.dialogLayout.y = (mon.height / 2) - (this.dialog.dialogLayout.height);

        this.list_workspace(ext);
        this.update_search_list(this.options);

        this.dialog.open(global.get_current_time(), false);
    }

    stop_services() {
        this.service.stop_services()
    }
}

function window_selection(ext: Ext, window: ShellWindow, icon_size: number): launch.SearchOption {
    let name = window.name(ext);
    let title = window.meta.get_title();

    if (name != title) {
        name += ': ' + title;
    }

    return new launch.SearchOption(
        name,
        null,
        'focus-windows-symbolic',
        {
            widget: window.icon(ext, icon_size)
        },
        icon_size,
        { window }
    )
}
