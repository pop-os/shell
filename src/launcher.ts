// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

const { Clutter, Gio, GLib, Pango, St } = imports.gi

import * as app_info from 'app_info'
import * as utils from 'utils'

import type { ShellWindow } from 'window'

const LOCAL_PLUGINS: string = GLib.get_home_dir() + "/.local/share/pop-shell/launcher/"
const SYSTEM_PLUGINS: string = "/usr/lib/pop-shell/launcher/"

export namespace Response {
    export interface Selection {
        id: number
        name: string
        description: null | string
        icon?: string
        content_type?: string
    }

    export interface Query {
        event: "queried",
        selections: Array<Selection>
    }

    export interface Fill {
        event: "fill",
        text: string
    }

    export interface Close {
        event: "close"
    }

    export type Response = Query | Fill | Close

    export function parse(input: string): null | Response {
        try {
            let object = JSON.parse(input) as Response
            switch (object.event) {
                case "close":
                case "fill":
                case "queried":
                    return object
            }
        } catch (e) {

        }

        return null
    }
}

export namespace Plugin {
    export interface Config {
        name: string
        description: string
        pattern: string
        exec: string
        icon: string
    }

    export function read(file: string): Config | null {
        global.log(`found plugin at ${file}`)
        try {
            let [ok, contents] = Gio.file_new_for_path(file)
                .load_contents(null)

            if (ok) return parse(imports.byteArray.toString(contents))
        } catch (e) {

        }

        return null
    }

    export function parse(input: string): Config | null {
        try {
            return JSON.parse(input)
        } catch (e) {
            return null
        }
    }

    export interface Source {
        config: Config
        cmd: string
        proc: null | utils.AsyncIPC
        pattern: null | RegExp
    }

    export function listen(plugin: Plugin.Source): null | Response.Response {
        if (!plugin.proc) {
            const proc = Plugin.start(plugin)
            if (proc) {
                plugin.proc = proc
            } else {
                return null
            }
        }

        try {
            let [bytes,] = plugin.proc.stdout.read_line(null)
            return Response.parse(imports.byteArray.toString(bytes))
        } catch (e) {
            return null
        }
    }

    export function complete(plugin: Plugin.Source): boolean {
        return send(plugin, { event: "complete" })
    }

    export function query(plugin: Plugin.Source, value: string): boolean {
        return send(plugin, { event: "query", value })
    }

    export function quit(plugin: Plugin.Source) {
        if (plugin.proc) {
            send(plugin, { event: "quit" })
            plugin.proc = null
        }
    }

    export function submit(plugin: Plugin.Source, id: number): boolean {
        return send(plugin, { event: "submit", id })
    }

    export function send(plugin: Plugin.Source, event: Object): boolean {
        let string = JSON.stringify(event)

        if (!plugin.proc) {
            plugin.proc = start(plugin)
        }

        function attempt(plugin: Plugin.Source, string: string) {
            if (!plugin.proc) return false

            try {
                plugin.proc.stdin.write_bytes(new GLib.Bytes(string + "\n"), null)
                return true
            } catch (e) {
                global.log(`failed to send message to ${plugin.config.name}: ${e}`)
                return false
            }
        }

        if (!attempt(plugin, string)) {
            plugin.proc = start(plugin)
            if (!attempt(plugin, string)) return false
        }

        return true
    }

    export function start(plugin: Plugin.Source): null | utils.AsyncIPC {
        return utils.async_process_ipc([plugin.cmd])
    }
}

export class LauncherService {
    private plugins: Map<string, Plugin.Source> = new Map()

    destroy() {
        for (const plugin of this.plugins.values()) Plugin.quit(plugin)
    }

    constructor() {
        this.register_plugins()
    }

    query(query: string, callback: (plugin: Plugin.Source, response: Response.Response) => void) {
        for (const plugin of this.match_query(query)) {
            global.log(`Plugin "${plugin.config.name} matches ${query}`)
            if (Plugin.query(plugin, query)) {
                const res = Plugin.listen(plugin)
                if (res) callback(plugin, res)
            } else {
                Plugin.quit(plugin)
            }
        }
    }

    stop_services() {
        for (const plugin of this.plugins.values()) {
            Plugin.quit(plugin)
            plugin.proc = null
        }
    }

    private register_plugins() {
        this.register_plugin_directory(LOCAL_PLUGINS)
        this.register_plugin_directory(SYSTEM_PLUGINS)
    }

    private register_plugin_directory(directory: string) {
        global.log(`checking for plugins in ${directory}`)
        let dir = Gio.file_new_for_path(directory)
        if (!dir.query_exists(null)) return

        try {
            let entries = dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null)
            let entry

            while ((entry = entries.next_file(null)) !== null) {
                if (entry.get_file_type() === 2) {
                    let name: string = entry.get_name()
                    const metapath = directory + '/' + name + '/meta.json'

                    const metadata = Gio.file_new_for_path(metapath)
                    if (!metadata.query_exists(null)) continue

                    let config = Plugin.read(metapath)
                    if (!config || this.plugins.has(config.name)) continue

                    let cmd = directory + '/' + name + '/' + config.exec

                    global.log(`found plugin: ${config.name}`)

                    let pattern = config.pattern ? new RegExp(config.pattern) : null

                    this.plugins.set(config.name, { config, cmd, proc: null, pattern })
                }
            }
        } catch (e) {
            global.log(`error enumerating: ${e}`)
        }
    }

    private *match_query(query: string): IterableIterator<Plugin.Source> {
        for (const plugin of this.plugins.values()) {
            if (!plugin.pattern || plugin.pattern.test(query)) {
                yield plugin
            } else {
                Plugin.quit(plugin)
            }
        }
    }
}

export interface IconByName {
    name: string
}

export interface IconByG {
    gicon: any
}

export interface IconWidget {
    widget: St.Widget
}

export type IconSrc = IconByName | IconByG | IconWidget

export interface AppOption {
    app: app_info.AppInfo
}

export interface WindowOption {
    window: ShellWindow
}

export interface PluginOption {
    plugin: Plugin.Source,
    id: number
}

export interface CalcOption {
    output: string
}

export type Identity = AppOption | WindowOption | PluginOption | CalcOption

export class SearchOption {
    title: string
    description: null | string
    id: Identity

    widget: St.Button

    shortcut: St.Widget = new St.Label({ text: "", style: "padding-right: 6px;padding-top: 6px;" })

    constructor(title: string, description: null | string, category_icon: string, icon: null | IconSrc, icon_size: number, id: Identity) {
        this.title = title
        this.description = description
        this.id = id

        let cat_icon = new St.Icon({
            icon_name: category_icon,
            icon_size: icon_size / 2,
            style_class: "pop-shell-search-cat"
        })

        let layout = new St.BoxLayout({})

        cat_icon.set_y_align(Clutter.ActorAlign.CENTER)

        let label = new St.Label({ text: title })

        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END)
        layout.add_child(cat_icon)

        if (icon) {
            let app_icon

            if ("name" in icon) {
                app_icon = new St.Icon({
                    icon_name: icon.name,
                    icon_size,
                    style_class: "pop-shell-search-icon"
                })
            } else if ("gicon" in icon) {
                app_icon = new St.Icon({
                    gicon: icon.gicon,
                    icon_size,
                    style_class: "pop-shell-search-icon"
                })
            } else {
                app_icon = icon.widget;
                (app_icon as any).style_class = "pop-shell-search-icon"
            }

            app_icon.set_y_align(Clutter.ActorAlign.CENTER)
            layout.add_child(app_icon)
        }

        let info_box = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, vertical: true, x_expand: true });

        info_box.add_child(label)

        if (description) {
            info_box.add_child(new St.Label({ text: description, style: "font-size: small" }))
        }

        layout.add_child(info_box)
        layout.add_child(this.shortcut)

        this.widget = new St.Button({ style_class: "pop-shell-search-element" });
        (this.widget as any).add_actor(layout)
    }
}
