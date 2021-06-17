// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

const { Clutter, Gio, GLib, Pango, St } = imports.gi

import * as app_info from 'app_info'
import * as plugins from 'launcher_plugins'

import type { ShellWindow } from 'window'
import type { Ext } from 'extension'
import type { Plugin as PluginType, Response } from 'launcher_plugins'

const { Plugin } = plugins

import * as plugin_scripts from 'plugin_scripts'
import * as plugin_shell from 'plugin_shell'

export var BUILTINS: Array<PluginType.Source> = [
    {
        backend: {
            builtin: (() => {
                const plug = new plugin_scripts.ScriptsBuiltin()
                plug.init()
                return plug
            })()
        },
        config: {
            name: "Shell Scripts",
            description: "User-defined shell scripts to execute",
            pattern: "",
            exec: "",
            icon: "utilities-terminal"
        },
        pattern: null
    },
    {
        backend: {
            builtin: new plugin_shell.ShellBuiltin()
        },
        config: {
            name: "Shell Shortcuts",
            description: "Access shell features from the keyboard",
            pattern: "",
            exec: "",
            icon: `${Me.path}/icons/pop-shell-auto-on-symbolic.svg`
        },
        pattern: null
    }
]

/** Launcher plugins installed locally */
const LOCAL_PLUGINS: string = GLib.get_home_dir() + "/.local/share/pop-shell/launcher/"

/** Launcher plugins that are installed system-wide */
const SYSTEM_PLUGINS: string = "/usr/lib/pop-shell/launcher/"

export class LauncherService {
    private plugins: Map<string, PluginType.Source> = new Map()

    destroy(ext: Ext) {
        for (const plugin of this.plugins.values()) Plugin.quit(ext, plugin)
    }

    constructor() {
        this.register_plugins()
    }

    query(ext: Ext, query: string, callback: (plugin: PluginType.Source, response: Response.Response) => void) {
        for (const plugin of this.match_query(ext, query)) {
            if (Plugin.query(ext, plugin, query)) {
                const res = Plugin.listen(plugin)
                if (res) callback(plugin, res)
            } else {
                Plugin.quit(ext, plugin)
            }
        }
    }

    stop_services(ext: Ext) {
        for (const plugin of this.plugins.values()) {
            if ('proc' in plugin.backend) {
                Plugin.quit(ext, plugin)
                plugin.backend.proc = null
            }
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

                    this.plugins.set(config.name, { config, backend: { cmd, proc: null }, pattern })
                }
            }
        } catch (e) {
            global.log(`error enumerating: ${e}`)
        }
    }

    private *match_query(ext: Ext, query: string): IterableIterator<PluginType.Source> {
        for (const plugin of BUILTINS) {
            if (!plugin.pattern || plugin.pattern.test(query)) {
                yield plugin
            }
        }

        for (const plugin of this.plugins.values()) {
            if (!plugin.pattern || plugin.pattern.test(query)) {
                yield plugin
            } else {
                Plugin.quit(ext, plugin)
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
    plugin: PluginType.Source,
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
    keywords: null | array

    widget: St.Button

    shortcut: St.Widget = new St.Label({ text: "", y_align: Clutter.ActorAlign.CENTER, style: "padding-left: 6px;padding-right: 6px" })

    constructor(title: string, description: null | string, category_icon: string, icon: null | IconSrc, icon_size: number, id: Identity, keywords: null | array) {
        this.title = title
        this.description = description
        this.id = id
        this.keywords = keywords

        let cat_icon
        const cat_icon_file = Gio.File.new_for_path(category_icon)
        if (cat_icon_file.query_exists(null)) {
            cat_icon = new St.Icon({
                gicon: Gio.icon_new_for_string(category_icon),
                icon_size: icon_size / 2,
                style_class: "pop-shell-search-icon"
            })
        } else {
            cat_icon = new St.Icon({
                icon_name: category_icon,
                icon_size: icon_size / 2,
                style_class: "pop-shell-search-cat"
            })
        }

        let layout = new St.BoxLayout({})

        cat_icon.set_y_align(Clutter.ActorAlign.CENTER)

        let label = new St.Label({ text: title })

        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END)
        layout.add_child(cat_icon)

        if (icon) {
            let app_icon

            if ("name" in icon) {
                const file = Gio.File.new_for_path(icon.name)

                if (file.query_exists(null)) {
                    app_icon = new St.Icon({
                        gicon: Gio.icon_new_for_string(icon.name),
                        icon_size,
                        style_class: "pop-shell-search-icon"
                    })
                } else {
                    app_icon = new St.Icon({
                        icon_name: icon.name,
                        icon_size,
                        style_class: "pop-shell-search-icon"
                    })
                }
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
