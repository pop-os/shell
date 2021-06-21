//@ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as app_info from 'app_info';
import * as error from 'error';
import * as DedicatedGPU from 'dedicated_gpu';
import * as launch from 'launcher_service';
import * as levenshtein from 'levenshtein';
import * as lib from 'lib';
import * as log from 'log';
import * as plugins from 'launcher_plugins';
import * as result from 'result';
import * as search from 'dialog_search';

import type { AppInfo } from 'app_info';
import type { Ext } from 'extension';
import type { ShellWindow } from 'window';

const { Clutter, Gio, GLib, Meta } = imports.gi

const { OK } = result;

const HOME_DIR: string = GLib.get_home_dir();
const DATA_DIRS_SYSTEM: string = GLib.get_system_data_dirs();
const DATA_DIRS_USER: string = GLib.get_user_data_dir();

export class Launcher extends search.Search {
    options: Array<launch.SearchOption>
    desktop_apps: Array<[string, AppInfo]>
    service: launch.LauncherService
    last_plugin: null | plugins.Plugin.Source
    mode: number

    constructor(ext: Ext) {
        let cancel = () => {
            ext.overlay.visible = false;
            this.stop_services(ext)
        };

        let search = (pat: string): Array<launch.SearchOption> | null => {
            this.options.splice(0)

            if (pat.length == 0) {
                this.list_workspace(ext);
                return this.options
            }

            const pattern = pat.toLowerCase()

            this.last_plugin = null

            let windows = new Array()

            this.service.query(ext, pattern, (plugin, response) => {
                if (response.event === "queried") {
                    for (const selection of response.selections) {
                        if (!this.last_plugin) this.last_plugin = plugin;

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
                    windows.push(window_selection(ext, window, this.icon_size()))
                }
            }

            // Filter matching desktop apps
            for (const [where, app] of this.desktop_apps) {
                const name = app.name()
                const keywords = app.keywords()
                const exec = app.exec()
                const app_items = keywords !== null ? 
                      name.split().concat(keywords).concat(exec) : name.split().concat(exec)
                
                for (const item of app_items) {
                    const item_match = item.toLowerCase()
                    if ( item_match.startsWith(pattern)
                         || item_match.includes(pattern)
                         || levenshtein.compare(item_match, pattern) < 3 {
                        const generic = app.generic_name();
                        const button = new launch.SearchOption(
                            name,
                            generic ? generic + " — " + where : where,
                            'application-default-symbolic',
                            { gicon: app.icon() },
                            this.icon_size(),
                            { app },
                            exec,
                            keywords
                        )

                        DedicatedGPU.addPopup(app, button.widget)

                        this.options.push(button)
                        break
                    }
                }
            }

            const sorter = (a: launch.SearchOption, b: launch.SearchOption) => {
                const a_name = a.title.toLowerCase()
                const b_name = b.title.toLowerCase()
                const a_exec = a.exec ? a.exec.toLowerCase() : ""
                const b_exec = b.exec ? b.exec.toLowerCase() : ""

                let a_weight = 0, b_weight = 0;

                // Sort by metadata (name, description, keywords)
                if (!a_name.startsWith(pattern)) {
                    a_weight = 1
                    if (!a_name.includes(pattern) {
                        a_weight = levenshtein.compare(a_name, pattern)
                        if (a.description) {
                            a_weight = Math.min(a_weight, levenshtein.compare(pattern, a.description.toLowerCase()))
                        }
                        if (a.keywords) {
                            for (const keyword of a.keywords) {
                                if keyword.toLowerCase().startsWith(pattern) || keyword.toLowerCase().includes(pattern) {
                                    a_weight = 1
                                } else {
                                    a_weight = Math.min(a_weight, (levenshtein.compare(pattern, keyword.toLowerCase()) + 1))
                                }
                            }
                        }
                    }
                }
                // Sort by command (exec)
                if (a_exec.includes(pattern)) {
                    if (a_exec.startsWith(pattern) {
                        a_weight = Math.min(a_weight, 2)
                    } else {
                        a_weight = Math.min(a_weight, levenshtein.compare(pattern, a_exec))
                    }
                }
                

                // Sort by metadata (name, description, keywords)
                if (!b_name.startsWith(pattern)) {
                    b_weight = 1
                    if (!b_name.includes(pattern)) {
                        b_weight = levenshtein.compare(b_name, pattern)
                        if (b.description) {
                            b_weight = Math.min(b_weight, levenshtein.compare(pattern, b.description.toLowerCase()))
                        }
                        if (b.keywords) {
                            for (const keyword of b.keywords) {
                                if keyword.toLowerCase().startsWith(pattern) || keyword.toLowerCase().includes(pattern) {
                                    b_weight = 1
                                } else {
                                    b_weight = Math.min(b_weight, (levenshtein.compare(pattern, keyword.toLowerCase()) + 1))
                                }
                            }
                        }
                    }
                }
                // Sort by command (exec)
                if (b_exec.includes(pattern)) {
                    if (b_exec.startsWith(pattern) {
                        b_weight = Math.min(b_weight, 2)
                    } else {
                        b_weight = Math.min(b_weight, levenshtein.compare(pattern, b_exec))
                    }
                }

                return a_weight === b_weight
                    ? a_name.length > b_name.length ? 1 : 0
                    : a_weight > b_weight ? 1 : 0
            }

            // Sort the list of matched selections
            windows.sort(sorter)
            this.options.sort(sorter);
            this.options = windows.concat(this.options)

            // Truncate excess items from the list
            this.options.splice(this.list_max);

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
                plugins.Plugin.submit(ext, plugin, id)

                const response = plugins.Plugin.listen(plugin)
                if (response) {
                    if (response.event === "fill") {
                        this.set_text(response.text)
                        return true
                    }
                }

            }

            return false
        };

        let complete = (): boolean => {
            if (this.last_plugin) {
                plugins.Plugin.complete(ext, this.last_plugin)
                const res = plugins.Plugin.listen(this.last_plugin)
                if (res && res.event === "fill") {
                    this.set_text(res.text)
                    return true
                }
            }
            return false
        }

        const quit = (id: number) => {
            const selected = this.options[id];

            if (typeof selected === 'undefined') {
                return true
            }

            const option = selected.id

            if ("window" in option) {
                option.window.meta.delete(global.get_current_time())
                cancel()
                this.close()
            }
        }

        super(cancel, search, complete, select, apply, quit);

        this.dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout._dialog.x_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout.y = 48;

        this.service = new launch.LauncherService()
        this.last_plugin = null
        this.options = new Array()
        this.desktop_apps = new Array();
        this.mode = -1;
    }

    clear(){
        super.clear();
        this.last_plugin = null;
    }

    load_desktop_files() {
        lib.bench("load_desktop_files", () => {
            this.desktop_apps.splice(0);
            for (const _path of DATA_DIRS_USER.split().concat(DATA_DIRS_SYSTEM)) {
                const path = _path.replace(/\/$/, '') + "/applications";
                for (const result of app_info.load_desktop_entries(path)) {
                    if (result.kind == OK) {
                        const value = result.value;
                        const existAt = this.desktop_apps.findIndex(([ _, app ]) => app.exec() == value.exec());
                        if (existAt == -1) {
                            let appType = 'System';
                            switch (path) {
                                case (HOME_DIR + "/.local/share/applications"):
                                    appType = 'User';
                                    break;
                                case ("/var/lib/flatpak/exports/share/applications"):
                                    appType = 'Flatpak (System)';
                                    break;
                                case (HOME_DIR + "/.local/share/flatpak/exports/share/applications"):
                                    appType = 'Flatpak (User)';
                                    break;
                                case ("/var/lib/snapd/desktop/applications"):
                                    appType = 'Snap (System)';
                                    break;
                            }
                            this.desktop_apps.push([appType, value]);
                        }
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
                if (this.options.length == this.list_max) break;
            }
        }
    }

    open(ext: Ext) {
        const mon = ext.monitor_work_area(ext.active_monitor());

        this.options.splice(0);
        this.clear();

        this.list_workspace(ext);
        this.update_search_list(this.options);

        super._open(global.get_current_time(), false);

        this.dialog.dialogLayout.x = (mon.width / 2) - (this.dialog.dialogLayout.width / 2);
        this.dialog.dialogLayout.y = (mon.height / 2) - (this.dialog.dialogLayout.height / 2);
    }

    stop_services(ext: Ext) {
        this.service.stop_services(ext)
    }
}

function window_selection(ext: Ext, window: ShellWindow, icon_size: number): launch.SearchOption {
    let name = window.name(ext);
    let title = window.meta.get_title();

    return new launch.SearchOption(
        title,
        name,
        'focus-windows-symbolic',
        {
            widget: window.icon(ext, icon_size)
        },
        icon_size,
        { window }
    )
}
