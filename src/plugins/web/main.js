#!/usr/bin/env gjs

const { GLib, Gio } = imports.gi

const STDIN = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: 0 }) })
const STDOUT = new Gio.DataOutputStream({ base_stream: new Gio.UnixOutputStream({ fd: 1 }) })

class App {
    constructor() {
        this.last_query = ''
        this.last_value = ''
        this.query_base = ''
        this.name_base = ''
        this.app_info = Gio.AppInfo.get_default_for_uri_scheme('https')
    }

    complete() {
        this.send({ event: "noop" })
    }

    build_query() {
        return `${this.query_base}${encodeURIComponent(this.last_query)}`
    }

    query(input) {
        const delim_position = input.indexOf(' ')
        const key = input.substring(0, delim_position)
        this.last_query = input.substr(delim_position + 1).trim()

        switch (key) {
            case 'wiki':
                this.query_base = 'https://wikipedia.org/w/index.php?search='
                this.name_base = 'Wikipedia'
                break

            case 'bing':
                this.query_base = 'https://www.bing.com/search?q='
                this.name_base = 'Bing'
                break

            case 'ddg':
                this.query_base = 'https://www.duckduckgo.com/?q='
                this.name_base = 'DuckDuckGo'
                break

            case 'google':
                this.query_base = 'https://www.google.com/search?q='
                this.name_base = 'Google'
                break

            case 'yt':
                this.query_base = 'https://www.youtube.com/results?search_query='
                this.name_base = 'YouTube'
                break

            case 'amazon':
                this.query_base = 'https://smile.amazon.com/s?k='
                this.name_base = 'Amazon'
                break

            case 'stack':
                this.query_base = 'https://stackoverflow.com/search?q='
                this.name_base = 'Stack Overflow'
                break

            case 'crates':
                this.query_base = 'https://crates.io/search?q='
                this.name_base = 'Crates.io'
                break

            case 'arch':
                this.query_base = 'https://wiki.archlinux.org/index.php/'
                this.name_base = 'Arch Wiki'
                break

            case 'pp':
                this.query_base = 'https://pop-planet.info/forums/search/1/?q='
                this.name_base = 'Pop!_Planet'
                break

            case 'ppw':
                this.query_base = 'https://pop-planet.info/wiki/?search='
                this.name_base = 'Pop!_Planet Wiki'
                break

            case 'rdt':
                this.query_base = 'https://www.reddit.com/search/?q='
                this.name_base = 'Reddit'
                break

            case 'bc':
                this.query_base = 'https://bandcamp.com/search?q='
                this.name_base = 'Bandcamp'
                break

            case 'lib':
                this.query_base = 'https://libraries.io/search?q='
                this.name_base = 'Libraries.io'
                break

            case 'npm':
                this.query_base = 'https://www.npmjs.com/search?q='
                this.name_base = 'npm'
                break

            case 'gist':
                this.query_base = 'https://gist.github.com/search?q='
                this.name_base = 'GitHub Gist'
                break

			case 'fh':
				this.query_base = 'https://flathub.org/apps/search/'
				this.name_base = 'FLATHUB'

            default:
                this.query_base = 'https://www.duckduckgo.com/?q='
                this.name_base = 'DuckDuckGo'
        }

        const selections = [{
            id: 0,
            description: this.build_query(),
            name: `${this.name_base}: ${this.last_query}`,
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
