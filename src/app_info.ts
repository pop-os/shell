// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio } = imports.gi;

import * as error from 'error';
import * as result from 'result';
import * as once_cell from 'once_cell';

import type { Result } from 'result';

const { Err, Ok } = result;

const OnceCell = once_cell.OnceCell;

export class AppInfo {
    app_info: any;

    desktop_name: string;

    private categories_: once_cell.OnceCell<string> = new OnceCell();
    private comment_: once_cell.OnceCell<string | null> = new OnceCell();
    private exec_: once_cell.OnceCell<string | null> = new OnceCell();
    private generic: once_cell.OnceCell<string | null> = new OnceCell();
    private keywords_: once_cell.OnceCell<Array<string>> = new OnceCell();

    private name_: string;

    constructor(path: string, app_info: any) {
        this.app_info = app_info;
        this.desktop_name = path.split('/').slice(-1)[0];

        const pos = this.desktop_name.lastIndexOf('.');
        this.desktop_name = this.desktop_name.slice(0, pos);

        this.name_ = this.string("Name") ?? "unknown";
    }

    static try_from(path: string): Result<AppInfo, error.Error> {
        const app_info = Gio.DesktopAppInfo.new_from_filename(path);
        return app_info
            ? Ok(new AppInfo(path, app_info))
            : Err(new error.Error(`failed to open app info for ${path}`));
    }

    get filename(): string {
        return this.app_info.filename;
    }

    categories(): string {
        return this.categories_.get_or_init(() => this.app_info.get_categories());
    }

    comment(): string | null {
        return this.comment_.get_or_init(() => this.string("Comment"));
    }

    exec(): string | null {
        return this.exec_.get_or_init(() => this.string("Exec"));
    }

    icon(): St.Widget {
        return this.app_info.get_icon();
    }

    generic_name(): string | null {
        return this.generic.get_or_init(() => this.app_info.get_generic_name());
    }

    keywords(): Array<string> {
        return this.keywords_.get_or_init(() => this.app_info.get_keywords());
    }

    launch(): Result<null, error.Error> {
        return this.app_info.launch([], null)
            ? Ok(null)
            : Err(new error.Error(`failed to launch ${this.filename}`));
    }

    name(): string {
        return this.name_;
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

export function* load_desktop_entries(path: string): IterableIterator<Result<AppInfo, error.Error>> {
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
            const desktop_path = path + '/' + name;
            const info = AppInfo.try_from(desktop_path);

            if (info.kind === result.OK) {
                const exec = info.value.exec();
                const show = info.value.app_info.should_show()
                    || (exec?.startsWith('gnome-control-center'))
                if (show) yield info;
            }
        }
    }
}
