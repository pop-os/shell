const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, GLib } = imports.gi;

import * as error from 'error';
import * as Log from 'log';

export class AppInfo {
    app_info: any;

    desktop_name: string;

    private name_: string;

    constructor(path: string, app_info: any) {
        this.app_info = app_info;
        this.desktop_name = path.split('/').slice(-1)[0];

        const pos = this.desktop_name.lastIndexOf('.');
        this.desktop_name = this.desktop_name.slice(0, pos);

        this.name_ = this.string("Name") ?? "unknown";
    }

    static try_from(path: string): AppInfo | error.Error {
        const app_info = Gio.DesktopAppInfo.new_from_filename(path);
        return app_info ? new AppInfo(path, app_info) : new error.Error(`failed to open app info for ${path}`);
    }

    get filename(): string {
        return this.app_info.filename;
    }

    categories(): string {
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

    name(): string {
        return this.name_;
    }

    launch(): null | error.Error {
        return this.app_info.launch([], null)
            ? null
            : new error.Error(`failed to launch ${this.filename}`);
    }

    display(): string {
        return `AppInfo {
    categories: ${this.categories()},
    comment: ${this.comment()},
    exe: ${this.exec()}
    filename: ${this.filename},
    generic name: ${this.generic_name()},
    icon: ${this.icon()},
    keywords: ${this.keywords()},
    name: ${this.name()},
}`;
    }

    private string(name: string): string | null {
        return this.app_info.get_string(name);
    }
}

export function *load_desktop_entries(path: string): IterableIterator<AppInfo | error.Error> {
    let dir = Gio.file_new_for_path(path);
    if (!dir.query_exists(null)) {
        return new error.Error(`desktop path is missing: ${path}`);
    }

    let entries, entry;
    try {
        entries = dir.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
        return new error.Error(String(e))
            .context(`failed to enumerate children of ${path}`);
    }

    while ((entry = entries.next_file(null)) != null) {
        const ft = entry.get_file_type();
        if (!(ft == Gio.FileType.REGULAR || ft == Gio.FileType.SYMBOLIC_LINK)) {
            continue
        }

        const name: string = entry.get_name();
        if (name.indexOf('.desktop') > -1) {
            const desktop_path = GLib.build_filenamev([path, name]);
            const info = AppInfo.try_from(desktop_path);

            if (info instanceof AppInfo && (info.app_info.get_is_hidden() || info.app_info.get_nodisplay())) {
                continue
            }

            yield info;
        }
    }
}
