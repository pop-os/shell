//@ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

import * as search from 'search'
import * as utils from 'utils'
import * as arena from 'arena'
import * as log from 'log'
import * as service from 'launcher_service'
import * as context from 'context'
import * as shell_window from 'window'
import * as config from 'config'

import type { Ext } from 'extension'
import type { ShellWindow } from 'window'
import type { JsonIPC } from 'launcher_service'

const { DefaultPointerPosition } = config
const { Clutter, Gio, GLib, Meta, Shell } = imports.gi

const app_sys = Shell.AppSystem.get_default();

interface SearchOption {
    result: JsonIPC.SearchResult
    menu: St.Widget
}

export class Launcher extends search.Search {
    ext: Ext
    options: Map<number, SearchOption> = new Map()
    options_array: Array<SearchOption> = new Array()
    windows: arena.Arena<ShellWindow> = new arena.Arena()
    service: null | service.LauncherService = null
    append_id: null | number = null

    constructor(ext: Ext) {
        super()

        this.ext = ext

        this.dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START
        this.dialog.dialogLayout._dialog.x_align = Clutter.ActorAlign.START
        this.dialog.dialogLayout.y = 48

        this.cancel = () => {
            ext.overlay.visible = false
            this.stop_services(ext)
        }

        this.search = (pat: string) => {
            if (this.service !== null) {
                this.service.query(pat)
            }
        }

        this.select = (id: number) => {
            ext.overlay.visible = false

            if (id >= this.options.size) return

            const option = this.options_array[id]
            if (option && option.result.window) {
                const win = this.ext.windows.get(option.result.window)
                if (!win) return

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

        this.activate_id = (id: number) => {
            ext.overlay.visible = false

            const selected = this.options_array[id]

            if (selected) {
                this.service?.activate(selected.result.id)
            }
        }

        this.complete = () => {
            const option = this.options_array[this.active_id]
            if (option) {
                this.service?.complete(option.result.id)
            }
        }

        this.quit = (id: number) => {
            const option = this.options_array[id]
            if (option) {
                this.service?.quit(option.result.id)
            }
        }
    }

    on_response(response: JsonIPC.Response) {
        if ("Close" === response) {
            this.close()
        } else if ("Update" in response) {
            this.clear()

            if (this.append_id !== null) {
                GLib.source_remove(this.append_id)
                this.append_id = null
            }

            if (response.Update.length === 0) {
                this.cleanup()
                return;
            }

            this.append_id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                const item = response.Update.shift()
                if (item) {
                    try {
                        const button = new search.SearchOption(
                            item.name,
                            item.description,
                            item.category_icon ? item.category_icon : null,
                            item.icon ? item.icon : null,
                            this.icon_size(),
                            null,
                            null,
                        )

                        const menu = context.addMenu(button.widget, (_menu) => {
                            this.service?.context(item.id);
                        })

                        this.append_search_option(button)
                        const result = { result: item, menu }
                        this.options.set(item.id, result)
                        this.options_array.push(result)
                    } catch (error) {
                        log.error(`failed to create SearchOption: ${error}`)
                    }
                }

                if (response.Update.length === 0) {
                    this.append_id = null
                    return false
                }

                return true
            })
        } else if ("Fill" in response) {
            this.set_text(response.Fill)
        } else if ("DesktopEntry" in response) {
            this.launch_desktop_entry(response.DesktopEntry)
            this.close()
        } else if ("Context" in response) {
            const { id, options } = response.Context

            const option = this.options.get(id)
            if (option) {
                (option.menu as any).removeAll()
                for (const opt of options) {
                    context.addContext(option.menu, opt.name, () => {
                        this.service?.activate_context(id, opt.id);
                    });

                    (option.menu as any).toggle()
                }
            } else {
                log.error(`did not find id: ${id}`)
            }
        } else {
            log.error(`unknown response: ${JSON.stringify(response)}`)
        }
    }

    clear() {
        this.options.clear()
        this.options_array.splice(0)
        super.clear()
    }

    launch_desktop_app(app: any, path: string) {
        try {
            app.launch([], null);
        } catch (why) {
            log.error(`${path}: could not launch by app info: ${why}`)
        }
    }

    launch_desktop_entry(entry: JsonIPC.DesktopEntry) {
        const basename = (name: string): string => {
            return name.substr(name.indexOf('/applications/') + 14).replace('/', '-')
        }

        const desktop_entry_id = basename(entry.path)

        const gpuPref = entry.gpu_preference === "Default"
                ? Shell.AppLaunchGpu.DEFAULT
                : Shell.AppLaunchGpu.DISCRETE;

        log.debug(`launching desktop entry: ${desktop_entry_id}`)

        let app = app_sys.lookup_desktop_wmclass(desktop_entry_id)

        if (!app) {
            app = app_sys.lookup_app(desktop_entry_id)
        }

        if (!app) {
            log.error(`GNOME Shell cannot find desktop entry for ${desktop_entry_id}`)
            log.error(`pop-launcher will use Gio.DesktopAppInfo instead`);

            const dapp = Gio.DesktopAppInfo.new_from_filename(entry.path);

            if (!dapp) {
                log.error(`could not find desktop entry for ${entry.path}`);
                return;
            }

            this.launch_desktop_app(dapp, entry.path);
            return;
        }

        const info = app.get_app_info()

        if (!info) {
            log.error(`cannot find app info for ${desktop_entry_id}`)
            return
        }

        const is_gnome_settings = info.get_executable() === "gnome-control-center"

        if (is_gnome_settings && app.state === Shell.AppState.RUNNING) {
            app.activate()
            const window = app.get_windows()[0]
            if (window) shell_window.activate(true, DefaultPointerPosition.TopLeft, window)
            return;
        }

        const existing_windows = app.get_windows().length

        try {
            app.launch(0, -1, gpuPref)
        } catch (why) {
            global.log(`failed to launch application: ${why}`)
            return;
        }

        let attempts = 0

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (app.state === Shell.AppState.STOPPED) {
                if (info) {
                    const window = this.locate_by_app_info(info);
                    if (window) {
                        window.activate(false)
                        return false;
                    }
                }
            } else if (app.state === Shell.AppState.RUNNING) {
                const windows: Array<Meta.Window> = app.get_windows();

                if (windows.length > existing_windows) {
                    let newest_window = null
                    let newest_time = null
                    for (const window of windows) {
                        const this_time = window.get_user_time()
                        if (newest_time === null || newest_time > this_time) {
                            newest_window = window
                            newest_time = this_time
                        }

                        if (this_time === 0) {
                            newest_window = window;
                            break
                        }
                    }

                    if (newest_window) {
                        this.ext.get_window(newest_window)?.activate(true);
                    }

                    return false
                }
            }

            attempts += 1
            if (attempts === 20) return false

            return true;
        })
    }

    list_workspace(ext: Ext) {
        for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
            this.windows.insert(window);
        }
    }

    load_desktop_files() {
        log.warn("pop-shell: deprecated function called (dialog_launcher::load_desktop_files)")
    }

    locate_by_app_info(info: any): null | ShellWindow {
        const exec_info: null | string = info.get_string("Exec")
        const exec = exec_info?.split(' ').shift()?.split('/').pop()
        if (exec) {
            for (const window of this.ext.tab_list(Meta.TabList.NORMAL, null)) {
                const pid = window.meta.get_pid()
                if (pid !== -1) {
                    try {
                        let f = Gio.File.new_for_path(`/proc/${pid}/cmdline`)
                        const [,bytes] = f.load_contents(null)
                        const output: string = imports.byteArray.toString(bytes)
                        const cmd = output.split(' ').shift()?.split('/').pop()
                        if (cmd === exec) return window
                    } catch (_) {

                    }
                }
            }
        }

        return null
    }

    open(ext: Ext) {
        const mon = ext.monitor_work_area(ext.active_monitor())

        super.cleanup()

        this.start_services()
        this.search('')

        super._open(global.get_current_time(), false)

        this.dialog.dialogLayout.x = (mon.width / 2) - (this.dialog.dialogLayout.width / 2)

        let height = mon.height >= 900 ? mon.height / 2 : mon.height / 3.5
        this.dialog.dialogLayout.y = height - (this.dialog.dialogLayout.height / 2)
    }

    start_services() {
        if (this.service === null) {
            log.debug("starting pop-launcher service")
            const ipc = utils.async_process_ipc(['pop-launcher'])
            this.service = ipc ? new service.LauncherService(ipc, (resp) => this.on_response(resp)) : null
        }
    }

    stop_services(_ext: Ext) {
        if (this.service !== null) {
            log.info(`stopping pop-launcher services`)
            this.service.exit()
            this.service = null
        }
    }
}