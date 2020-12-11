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
        this.selections = [
            {
                id: 0,
                name: "Shut Down",
                aliases: [
                    "Power Off"
                ],
                description: null,
                icon: "system-shutdown"
            },

            {
                id: 1,
                name: "Restart",
                aliases: [
                    "Reboot"
                ],
                description: null,
                icon: "system-restart"
            },

            {
                id: 2,
                name: "Log Out",
                description: null,
                icon: "system-log-out"
            }
        ]
    }

    complete() {
        this.send({ event: "noop" })
    }

    query(input) {
        const selections = filter_selections(this.selections, input.toLowerCase())

        this.send({ event: "queried", selections })
    }

    submit(id) {
        let cmd = null
        switch (id) {
            case 0:
                cmd = "gnome-session-quit --power-off"
                break
            case 1:
                cmd = "gnome-session-quit --reboot"
                break
            case 2:
                cmd = "gnome-session-quit --logout"
                break
        }

        if (cmd) {
            try {
                GLib.spawn_command_line_async(cmd)
            } catch (e) {
                log(`session command '${cmd}' failed: ${e}`)
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
                    if (typeof event_.value !== 'undefined') app.query(event_.value)
                    break
                case "quit":
                    break mainloop
                case "submit":
                    if (event_.id !== null) app.submit(event_.id)
            }
        }
    }
}

function filter_selections(initial, input) {
    if (input.length === 0) return []

    let selections = initial.map(v => ({ ...v }))

    let remove = new Array()
    for (let id = 0; id < selections.length; id += 1) {
        const { name, aliases } = selections[id]

        if (name.toLowerCase().includes(input)) continue

        if (aliases) for (const alias of aliases) {
            if (alias.toLowerCase().includes(input)) continue
        }

        remove.push(id)
    }

    for (const id of remove.reverse()) swap_remove(selections, id)

    return selections
}

/**
 * 
 * @param {Array<T>} array 
 * @param {number} index 
 * @returns {T | undefined}
 */
function swap_remove(array, index) {
    array[index] = array[array.length - 1];
    return array.pop();
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