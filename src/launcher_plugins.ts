// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

const { Gio, GLib } = imports.gi

import * as utils from 'utils'
import type { Ext } from 'extension'

export interface Selection {
    id: number,
    name: string,
    description: string,
    fill?: string
}

/** The trait which all builtin plugins implement */
export abstract class Builtin {
    /** Stores the last search result */
    last_response: null | Response.Response = null

    /** Results of the last query */
    selections: Array<Response.Selection> = new Array()

    /** Initializes default values and resets state */
    abstract init(): void

    /** Uses the search input to query for search results */
    abstract query(ext: Ext, query: string): Response.Response

    /** Applies an option by its ID */
    abstract submit(ext: Ext, id: number): Response.Response

    /** Dispatches a launcher request, and stores the response */
    handle(ext: Ext, event: Request.Request) {
        switch (event.event) {
            case "complete":
                this.last_response = { event: "noop" }
                break
            case "query":
                this.last_response = this.query(ext, event.value)
                break
            case "submit":
                this.last_response = this.submit(ext, event.id)
                break
            default:
                this.last_response = { event: "noop" }

        }
    }
}

export namespace Request {
    export type Request = Complete | Submit | Query | Quit

    export interface Complete {
        event: 'complete',
    }

    export interface Submit {
        event: 'submit',
        id: number
    }

    export interface Quit {
        event: 'quit'
    }

    export interface Query {
        event: 'query',
        value: string
    }
}

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

    export interface NoOp {
        event: 'noop'
    }

    export type Response = Query | Fill | Close | NoOp

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
        fill?: string
        examples?: string
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

    export interface External {
        cmd: string
        proc: null | utils.AsyncIPC
    }

    export interface BuiltinVariant {
        builtin: Builtin
    }

    export interface Source {
        config: Config
        backend: External | BuiltinVariant
        pattern: null | RegExp
    }

    export function listen(plugin: Plugin.Source): null | Response.Response {
        if ('builtin' in plugin.backend) {
            return plugin.backend.builtin.last_response
        } else {
            const backend = plugin.backend
            if (!backend.proc) {
                const proc = Plugin.start(backend)
                if (proc) {
                    backend.proc = proc
                } else {
                    return null
                }
            }

            try {
                let [bytes,] = backend.proc.stdout.read_line(null)
                return Response.parse(imports.byteArray.toString(bytes))
            } catch (e) {
                return null
            }
        }
    }

    export function complete(ext: Ext, plugin: Plugin.Source): boolean {
        return send(ext, plugin, { event: "complete" })
    }

    export function query(ext: Ext, plugin: Plugin.Source, value: string): boolean {
        return send(ext, plugin, { event: "query", value })
    }

    export function quit(ext: Ext, plugin: Plugin.Source) {
        if ('proc' in plugin.backend) {
            if (plugin.backend.proc) {
                send(ext, plugin, { event: "quit" })
                plugin.backend.proc = null
            }
        } else {
            send(ext, plugin, { event: "quit" })
        }
    }

    export function submit(ext: Ext, plugin: Plugin.Source, id: number): boolean {
        return send(ext, plugin, { event: "submit", id })
    }

    export function send(ext: Ext, plugin: Plugin.Source, event: Request.Request): boolean {
        const backend = plugin.backend

        if ('builtin' in backend) {
            backend.builtin.handle(ext, event)
            return true
        } else {
            let string = JSON.stringify(event)

            if (!backend.proc) {
                backend.proc = start(backend)
            }

            function attempt(name: string, plugin: Plugin.External, string: string) {
                if (!plugin.proc) return false

                try {
                    plugin.proc.stdin.write_bytes(new GLib.Bytes(string + "\n"), null)
                    return true
                } catch (e) {
                    global.log(`failed to send message to ${name}: ${e}`)
                    return false
                }
            }

            if (!attempt(plugin.config.name, backend, string)) {
                backend.proc = start(backend)
                if (!attempt(plugin.config.name, backend, string)) return false
            }
        }

        return true
    }

    export function start(plugin: Plugin.External): null | utils.AsyncIPC {
        return utils.async_process_ipc([plugin.cmd])
    }
}