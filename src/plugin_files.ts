// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

const { Gio, GLib } = imports.gi

import * as plugins from 'launcher_plugins'
import * as utils from 'utils'

import type { Response, Selection } from 'launcher_plugins'
import type { Ext } from './extension'

function add(id: number, file: string, content_type: string): Selection {
    const pos = file.lastIndexOf("/")
    return {
        id,
        name: pos === 0 ? file : file.substr(pos + 1),
        description: "~/" + file,
        content_type
    }
}

export class ShellBuiltin extends plugins.Builtin {
    selections: Array<Selection> = []

    init() {}

    query(_ :Ext, query: string): Response.Response {
        let id = 0
        this.selections.splice(0)
        const search = query.substr(query.indexOf(" ") + 1).trim()
        if (search.length > 2) {
            const cmd = utils.async_process_ipc(["fdfind", search])
            if (cmd) {
                while (true) {
                    try {
                        const [bytes,read] = cmd.stdout.read_line(null)
                        if (bytes === null || read === 0) break
                        const file = imports.byteArray.toString(bytes)
                        const gfile = Gio.File.new_for_path(file)
                        if (gfile.query_exists(null)) {
                            let content_type
                            if (GLib.file_test (file, GLib.FileTest.IS_DIR)) {
                                content_type = "inode/directory"
                            } else {
                                const [c,] = Gio.content_type_guess(file, null)
                                content_type = c
                            }

                            this.selections.push(add(id, file, content_type))
                            id += 1

                            if (id === 7) {
                                break
                            }
                        }
                    } catch (e) {
                        global.log(`pop-shell: plugin-files: ${e.message}`)
                        break
                    }
                }
            }
        } else {
            this.selections.push({ id: 0, name: "file <requires 3 characters minimum>", description: "" })
        }

        return {
            event: "queried",
            selections: this.selections
        }
    }

    submit(_: Ext, id: number): Response.Response {
        const result = this.selections[id]

        if (result) {
            if (result.description.length === 0) {
                return { event: "noop" }
            }

            try {
                GLib.spawn_command_line_async(`xdg-open '${result.description.substr(2)}'`)
            } catch (e) {
                global.log(`xdg-open failed: ${e}`)
            }
        }

        return { event: "close" }
    }
}