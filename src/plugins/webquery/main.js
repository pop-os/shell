#!/usr/bin/env gjs

const { GLib, Gio } = imports.gi;

const STDIN = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: 0 }) })
const STDOUT = new Gio.DataOutputStream({ base_stream: new Gio.UnixOutputStream({ fd: 1 }) })

class App {
    constructor() {
        this.last_query = ""
        this.last_value = ""
        this.query_base = this.get_query()
        this.app_info = Gio.AppInfo.get_default_for_uri_scheme('https')
    }

    get_query() {
        const schema = Gio.SettingsSchemaSource.new_from_directory(
          Gio.File.new_for_path(`${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/pop-shell@system76.com`).get_child("schemas").get_path(),
          Gio.SettingsSchemaSource.get_default(),
          false
        )
      
        const settings = new Gio.Settings({
          settings_schema: schema.lookup("org.gnome.shell.extensions.pop-shell", true),
        })

        return settings.get_string('search-engine')
      }

    complete() {
        this.send({ event: "noop" })
    }

    build_query() {
        return `${this.query_base}${encodeURIComponent(this.last_query)}`
    }

    query(input) {
        this.last_query = input.startsWith('q:') ? input.substr(2) : input;

        try {
            this.last_value = evaluate(this.last_query).toString()
        } catch (e) {
            this.last_value = this.last_query + ` x = ?`
        }

        const selections = [{
            id: 0,
            name: this.build_query(),
            description: null,
            icon: this.app_info.get_icon().to_string(),
        }]

        this.send({ event: "queried", selections })
    }

    submit(_id) {
        try {
            GLib.spawn_command_line_async(`xdg-open ${this.build_query()}`)
        } catch (e) {
            log(`xdg-open failed: ${e} `)
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
