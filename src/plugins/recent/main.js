#!/usr/bin/gjs

const { GLib, Gio, Gtk } = imports.gi

/**
 * Request received by the Pop Shell launcher
 * @typedef {Object} LauncherRequest
 * @property {'complete' | 'submit' | 'query' | 'quit'} event
 * @property {string?} value
 * @property {number?} id
 */

/**
 * Selection for Pop Shell to display
 * @typedef {Object} Selection
 * @property {string} name
 * @property {string} icon
 * @property {string} description
 * @property {number} id
 */

/**
 * @typedef {Object} RecentItem
 * @property {string} display_name
 * @property {string} mime,
 * @property {string} uri
 */

const STDIN = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: 0 }) })
const STDOUT = new Gio.DataOutputStream({ base_stream: new Gio.UnixOutputStream({ fd: 1 }) })

class App {
    constructor() {
        this.last_query = ""
        this.manager = Gtk.RecentManager.get_default()
        this.results = new Array()
    }

    /**
     * @returns {undefined | Array<RecentItem>}
     */
    items() {
        const recent_items = this.manager.get_items()

        if (!recent_items) { return undefined }

        const items = recent_items
            .filter(item => item.exists())
            .map(item => {
                return {
                    display_name: item.get_display_name(),
                    mime: item.get_mime_type(),
                    uri: item.get_uri()
                }
            })

        return items
    }

    complete() {
        this.send({ event: "noop" })
    }

    query(input) {
        input = input.substring(2).trim()
        
        const items = this.items()

        let selections = new Array()

        if (items) {
            const normalized = input.toLowerCase()

            this.results = items
                .filter(item => item.display_name.toLowerCase().includes(normalized) || item.uri.toLowerCase().includes(normalized))
                .sort((a, b) => a.display_name.localeCompare(b.display_name))
                .slice(0, 9)

            let id = 0
            
            for (const item of this.results) {
                selections.push({
                    name: item.display_name,
                    description: decodeURI(item.uri),
                    content_type: item.mime,
                    id
                })

                id += 1
            }
        }

        this.send({ event: "queried", selections })
    }

    submit(id) {
        const result = this.results[id]

        if (result) {
            try {
                GLib.spawn_command_line_async(`xdg-open '${result.uri}'`)
            } catch (e) {
                log(`xdg-open failed: ${e}`)
            }
        }

        this.send({ event: "close" })
    }

    send(object) {
        STDOUT.write_bytes(new GLib.Bytes(JSON.stringify(object) + "\n"), null)
    }
}

function main() {
    /** @type {null | ByteArray} */
    let input_array

    /** @type {string} */
    let input_str

    /** @type {null | LauncherRequest} */
    let event_

    let app = new App()

    mainloop:
    while (true) {
        try {
            [input_array,] = STDIN.read_line(null)
        } catch (e) {
            break
        }

        input_str = imports.byteArray.toString(input_array)
        if ((event_ = parse_event(input_str)) !== null) {
            switch (event_.event) {
                case "complete":
                    app.complete()
                    break
                case "query":
                    if (event_.value) app.query(event_.value)
                    break
                case "quit":
                    break mainloop
                case "submit":
                    if (event_.id !== null) app.submit(event_.id)
            }
        }
    }
}

/**
 * Parses an IPC event received from STDIN
 * @param {string} input
 * @returns {null | LauncherRequest}
 */
function parse_event(input) {
    try {
        return JSON.parse(input)
    } catch (e) {
        log(`Input not valid JSON`)
        return null
    }
}

main()
