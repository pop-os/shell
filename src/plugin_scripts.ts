// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

const { Gio, GLib } = imports.gi

import * as plugins from 'launcher_plugins'

import type { Response } from 'launcher_plugins'

/** Scripts maintained by the user */
const LOCAL: string = GLib.get_home_dir() + "/.local/share/pop-shell/scripts/"

/** Scripts maintained by this project, or the distribution */
const SYSTEM: string = "/usr/lib/pop-shell/scripts/"

interface ScriptData {
    name: string
    path: string
    keywords: Array<string>
    description: null | string
    icon?: string
}

export class ScriptsBuiltin extends plugins.Builtin {
    scripts: Array<ScriptData> = new Array()

    filtered: Array<ScriptData> = new Array()

    sums: Set<string> = new Set()

    init() {
        this.sums.clear()
        this.scripts.splice(0)

        this.load_from(LOCAL)
        this.load_from(SYSTEM)
    }

    load_from(path: string) {
        try {
            const dir = Gio.file_new_for_path(path)

            if (!dir.query_exists(null)) return

            const entries = dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
            
            let entry;

            while ((entry = entries.next_file(null)) !== null) {
                const name = entry.get_name()

                if (this.sums.has(name)) continue

                log(`adding ${name}`)

                /** Describes a script, parsed from code comments at the top of the file */
                const metadata: ScriptData = {
                    name,
                    path: path + name,
                    keywords: new Array(),
                    description: null,
                }

                try {
                    const stream = Gio.DataInputStream.new(Gio.File.new_for_path(metadata.path).read(null))
                    
                    while (true) {
                        const [bytes] = stream.read_line(null)

                        if (!bytes) break

                        let line = imports.byteArray.toString(bytes)

                        if (!line.startsWith("#")) break

                        line = line.substring(1).trim()

                        if (line.startsWith("name:")) {
                            metadata.name = line.substring(5).trim()
                        } else if (line.startsWith("description:")) {
                            metadata.description = line.substring(12).trim()
                        } else if (line.startsWith("icon:")) {
                            metadata.icon = line.substring(5).trim()
                        } else if (line.startsWith("keywords:")) {
                            metadata.keywords = line.substring(9).trim().split(/\s+/)
                        }
                    }

                    this.scripts.push(metadata)
                    this.sums.add(name)
                } catch (e) {
                    log(`failed to read from script at ${metadata.path}: ${e}`)
                    continue
                }
            }
        } catch (e) {
            log(`failure to collect scripts for script plugin: ${e}`)
        }
    }

    query(query: string): Response.Response {
        this.filtered.splice(0)
        this.selections.splice(0)

        query = query.toLowerCase()

        let id = 0

        for (const script of this.scripts) {
            let should_include = script.name.toLowerCase().includes(query)
                || script.description?.toLowerCase().includes(query)
                || script.keywords.reduce((acc: boolean, next: string) => acc || next.includes(query), false)
            
            if (should_include) {
                const selection: Response.Selection = {
                    id,
                    name: script.name,
                    description: script.description,
                }

                if (script.icon) selection.icon = script.icon

                this.selections.push(selection)
                this.filtered.push(script)

                id += 1
            }
        }

        return { event: "queried", selections: this.selections }
    }

    submit(id: number): Response.Response {
        let script = this.filtered[id]

        log(`submitting: ${script}`)

        if (script) {
            try {
                log(`executing ${script.path}`)
                GLib.spawn_command_line_async(`sh ${script.path}`)
            } catch (e) {
                log(`failed to spawn script at ${script.path}: ${e}`)
            }
        }

        return { event: "noop" }
    }
}