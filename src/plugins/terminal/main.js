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
        this.last_query = ""
        this.shell_only = false
    }

    complete() {
        this.send({ event: "noop" })
    }

    /** @param {string} input */
    query(input) {
        if (input.startsWith(':')) {
            this.shell_only = true
            this.last_query = input.substr(1).trim()
        } else {
            this.shell_only = false
            this.last_query = input.startsWith('t:')
                ? input.substr(2)
                : input.substr(input.indexOf(" ") + 1)
        }


        let selections = [{
            id: 0,
            name: this.last_query,
            description: "run command in terminal",
        }]

        this.send({ event: "queried", selections })
    }

    /** @param {number} _id */
    submit(_id) {
        try {
            let runner
            if (this.shell_only) {
                runner = ""
            } else {
                let path = GLib.find_program_in_path('x-terminal-emulator');
                let [terminal, splitter] = path ? [path, "-e"] : ["gnome-terminal", "--"];
                runner = `${terminal} ${splitter} `
            }

            GLib.spawn_command_line_async(`${runner}sh -c '${this.last_query}; echo "Press to exit"; read t'`);
        } catch (e) {
            log(`command launch error: ${e}`)
        }

        this.send({ event: "close" })
    }

    /** @param {Object} object */
    send(object) {
        try {
            STDOUT.write_bytes(new GLib.Bytes(JSON.stringify(object) + "\n"), null)
        } catch (e) {
            log(`failed to send response to Pop Shell: ${e}`)
        }
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