#!/usr/bin/env gjs

const { GLib, Gio } = imports.gi

const STDIN = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: 0 }) })
const STDOUT = new Gio.DataOutputStream({ base_stream: new Gio.UnixOutputStream({ fd: 1 }) })

const ENTRIES = new Map([
    ['wiki', { query: 'https://wikipedia.org/w/index.php?search=', name: 'Wikipedia' }],
    ['bing', { query: 'https://www.bing.com/search?q=', name: 'Bing' }],
    ['ddg', { query: 'https://www.duckduckgo.com/?q=', name: 'DuckDuckGo' }],
    ['google', { query: 'https://www.google.com/search?q=', name: 'Google' }],
    ['yt', { query: 'https://www.youtube.com/results?search_query=', name: 'YouTube' }],
    ['amazon', { query: 'https://smile.amazon.com/s?k=', name: 'Amazon' }],
    ['stack', { query: 'https://stackoverflow.com/search?q=', name: 'Stack Overflow' }],
    ['crates', { query: 'https://crates.io/search?q=', name: 'Crates.io' }],
    ['rdt', { query: 'https://www.reddit.com/search/?q=', name: 'reddit' }],
    ['arch', { query: 'https://wiki.archlinux.org/index.php/', name: 'Arch Wiki' }],
    ['pp', { query: 'https://pop-planet.info/forums/search/1/?q=', name: 'Pop!_Planet' }],
    ['ppw', { query: 'https://pop-planet.info/wiki/?search=', name: 'Pop!_Planet Wiki' }],
    ['bc', { query: 'https://bandcamp.com/search?q=', name: 'Bandcamp' }],
    ['npm', { query: 'https://www.npmjs.com/search?q=', name: 'npm' }],
    ['lib', { query: 'https://libraries.io/search?q=', name: 'Libraries.io' }],
    ['gist', { query: 'https://gist.github.com/search?q=', name: 'GitHub Gist' }],
    ['fh', { query: 'https://flathub.org/apps/search/', name: 'Flathub' }],
    ['gh', { query: 'https://github.com/search?q=', name: 'GitHub' }],
    ['sdcl', { query: 'https://soundcloud.com/search?q=', name: 'SoundCloud' }],
    ['twitch', { query: 'https://www.twitch.tv/search?term=', name: 'Twitch' }],
    ['yh', { query: 'https://search.yahoo.com/search?p=', name: 'Yahoo!' }],
    ['alie', { query: 'https://www.aliexpress.com/wholesale?SearchText=', name: 'AliExpress' }]
])

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

        const entry = ENTRIES.get(key) || { query: 'https://www.duckduckgo.com/?q=', name: 'DuckDuckGo' }
        this.query_base = entry.query;
        this.name_base = entry.name;

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
