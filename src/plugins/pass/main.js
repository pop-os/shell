#!/usr/bin/gjs

const { GLib, Gio, Notify } = imports.gi;

Notify.init('Password Store');

/** The directory that this script is executed from. */
const SCRIPT_DIR = GLib.path_get_dirname(new Error().stack.split(':')[0].slice(1));

/** Add our directory so we can import modules from it. */
imports.searchPath.push(SCRIPT_DIR)

const STDIN = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: 0 }) })
const STDOUT = new Gio.DataOutputStream({ base_stream: new Gio.UnixOutputStream({ fd: 1 }) })


function list_passwords(root, directory) {
    const entries = directory.enumerate_children(
        Gio.FILE_ATTRIBUTE_STANDARD_NAME + "," +
        Gio.FILE_ATTRIBUTE_STANDARD_TYPE + "," +
        Gio.FILE_ATTRIBUTE_STANDARD_IS_HIDDEN,
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null
    );

    let entry;
    let results = [];

    while((entry = entries.next_file(null)) !== null) {
        const name = entry.get_name();
        const target_file = directory.get_child(entry.get_name());

        if (entry.get_file_type() === Gio.FileType.DIRECTORY) {
            results = results.concat(list_passwords(root, target_file))
        } else if (name.endsWith('.gpg')) {
            let path = root.get_relative_path(target_file);
            results.push(path.replace('.gpg', ''));
        }
    }
    return results;
}

function send_notification(body, icon) {
    let notification = Notify.Notification.new(
        'Password Store',
        body,
        icon,
    );
    notification.show();
}


class App {
    constructor() {
        let home_dir = GLib.get_home_dir();
        let password_store = Gio.File.new_for_path(`${home_dir}/.password-store`);

        if (password_store.query_exists(null)) {
            this.passwords = list_passwords(password_store, password_store);
        } else {
            this.passwords = [];
        }

        this.selections = [];

        let i = 0;
        for (i = 0; i < this.passwords.length; i++) {
            let password = this.passwords[i];
            this.selections.push({
                id: i,
                name: password,
                description: null,
                icon: 'dialog-password',
            })
        }
    }

    complete() {
        this.send({ event: "noop" })
    }

    query(input) {
        let query = input.toLowerCase();
        let selections = this.selections.filter(value => value.name.toLowerCase().includes(query));

        this.send({ event: "queried", selections })
    }

    submit(_id) {
        let entry = this.selections.find(element => element.id == _id);

        if (entry !== null) {
            this.send({ event: "close" })

            let command = ['pass', '-c', entry.name];
            GLib.spawn_async(
                null,
                command,
                null,
                GLib.SpawnFlags.SEARCH_PATH,
                null
            );
            send_notification(`Copied ${entry.name} password to clipboard`, 'dialog-password')
        }

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

    while (true) {
        try {
            [input_array,] = STDIN.read_line(null)
            input_str = imports.byteArray.toString(input_array)
        } catch (e) {
            break
        }

        if ((event_ = parse_event(input_str)) !== null) {
            switch (event_.event) {
                case "complete":
                    app.complete()
                    break
                case "query":
                    if (event_.value) app.query(event_.value)
                    break
                case "quit":
                    break
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
