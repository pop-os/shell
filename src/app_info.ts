const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, GLib } = imports.gi;

import * as error from 'error';
import * as Log from 'log';

export class AppInfo {
    app_info: any;

    constructor(app_info: any) {
        this.app_info = app_info;
    }

    static try_from(path: string): AppInfo | error.Error {
        const app_info = Gio.DesktopAppInfo.new_from_filename(path);
        return app_info ? new AppInfo(app_info) : new error.Error(`failed to open app info for ${path}`);
    }

    get filename(): string {
        return this.app_info.filename;
    }

    categories(): Array<string> {
        return this.app_info.get_categories();
    }

    comment(): string | null {
        return this.string("Comment");
    }

    exec(): string | null {
        return this.string("Exec");
    }

    icon(): string | null {
        return this.string("Icon");
    }

    generic_name(): string | null {
        return this.app_info.get_generic_name();
    }

    keywords(): Array<string> {
        return this.app_info.get_keywords();
    }

    name(): string | null {
        return this.string("Name");
    }

    launch(): null | error.Error {
        return this.app_info.launch([], null)
            ? null
            : new error.Error(`failed to launch ${this.filename}`);
    }

    display(): string {
        return `AppInfo {
    filename: ${this.filename},
    name: ${this.name()},
    icon: ${this.icon()},
    comment: ${this.comment()},
    categories: ${this.categories()},
    generic name: ${this.generic_name()},
    exe: ${this.exec()}
}`;
    }

    private string(name: string): string | null {
        return this.app_info.get_string(name);
    }
}

export function *load_desktop_entries(search_paths: IterableIterator<string>): IterableIterator<AppInfo | error.Error> {
    for (const path of search_paths) {
        let dir = Gio.file_new_for_path(path);
        if (!dir.query_exists(null)) {
            Log.warn(`desktop path is missing: ${path}`);
            continue
        }

        let entries, entry;
        try {
            entries = dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            Log.error(`failed to enumerate children of ${path}: ${e}`);
            continue
        }

        while ((entry = entries.next_file(null)) != null) {
            const ft = entry.get_file_type();
            if (!(ft == Gio.FileType.REGULAR || ft == Gio.FileType.SYMBOLIC_LINK)) {
                continue
            }

            const name: string = entry.get_name();
            if (name.indexOf('.desktop') > -1) {
                const desktop_path = GLib.build_filenamev([path, name]);
                yield AppInfo.try_from(desktop_path);
            }
        }
    }
}
