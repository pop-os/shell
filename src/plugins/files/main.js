#!/usr/bin/gjs

const { GLib, Gio } = imports.gi;

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

const STDIN = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: 0 }) })
const STDOUT = new Gio.DataOutputStream({ base_stream: new Gio.UnixOutputStream({ fd: 1 }) })

class App {
    constructor() {
        /** @type Array<Selection> */
        this.selections = new Array()
        
        /** @type string */
        this.parent = ""

        /** @type string */
        this.last_query = ""
    }

    /**
     * Performs tab completion based on the last-given search query.
     */
    complete() {
        let text

        const selected = this.selections[0]
        if (selected) {
            text = selection_path(this.parent, selected)
        } else {
            text = this.last_query
        }

        this.send({ event: "fill", text })
    }

    /**
     * Queries the plugin for results from this input
     * 
     * @param {string} input 
     */
    query(input) {
        if (input.startsWith('~')) {
            input = GLib.get_home_dir() + input.substr(1)
        }

        this.last_query = input
        this.selections.splice(0)
        this.parent = GLib.path_get_dirname(input)

        /** @type string */
        let base = GLib.path_get_basename(input)
        
        const show_hidden = base.startsWith('.')

        if (this.parent.endsWith(base)) base = ""

        try {
            const dir = Gio.file_new_for_path(this.parent)
            if (dir.query_exists(null)) {
                const entries = dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
                let entry;

                while ((entry = entries.next_file(null)) !== null) {
                    /** @type {string} */
                    const name = entry.get_name()

                    if (base.length !== 0 && name.toLowerCase().indexOf(base.toLowerCase()) === -1) {
                        continue
                    }

                    if (!show_hidden && name.startsWith('.')) continue 

                    const content_type = entry.get_content_type()
                    const directory = entry.get_file_type() === 2

                    this.selections.push({
                        id: 0,
                        name,
                        description: GLib.format_size_for_display(entry.get_size()),
                        content_type,
                        directory
                    })

                    if (this.selections.length === 10) break
                }
            }

            this.selections.sort((a, b) => {
                const a_name = a.name.toLowerCase()
                const b_name = b.name.toLowerCase()

                const pattern_lower = input.toLowerCase()

                const a_includes = a_name.includes(pattern_lower)
                const b_includes = b_name.includes(pattern_lower)

                return ((a_includes && b_includes) || (!a_includes && !b_includes)) ? (a_name > b_name ? 1 : 0) : a_includes ? -1 : b_includes ? 1 : 0;
            })

            let id = 0
            for (const v of this.selections) {
                v.id = id
                id += 1
            }
        } catch (e) {
            log(`QUERY ERROR: ${e} `)
        }

        let selections = this.selections.map(s => ({ ...s }))
        for (let select of selections) {
            delete select.directory
        }

        this.send({ event: "queried", selections })
    }

    /**
     * Applies an option that the user selected
     * 
     * @param {number} id
     */
    submit(id) {
        const selected = this.selections[id]

        if (selected) {
            const path = selection_path(this.parent, selected)
            try {
                GLib.spawn_command_line_async(`xdg-open '${path}'`)
            } catch (e) {
                log(`xdg-open failed: ${e} `)
            }
        }

        this.send({ event: "close" })
    }

    /**
     * Sends message back to Pop Shell
     * 
     * @param {Object} object 
     */
    send(object) {
        STDOUT.write_bytes(new GLib.Bytes(JSON.stringify(object) + "\n"), null)
    }
}

/**
 * 
 * @param {string} parent 
 * @param {Selection} selection
 * @returns {string}
 */
function selection_path(parent, selection) {
    let text = parent
        + (parent.endsWith("/") ? "" : "/")
        + selection.name

    if (selection.directory) text += "/"

    return text
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
