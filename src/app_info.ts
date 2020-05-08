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
    private should_show_: once_cell.OnceCell<boolean> = new OnceCell();
    private executable_: once_cell.OnceCell<string> = new OnceCell();

    private name_: string;

    constructor(app_info: any) {
        this.app_info = app_info;
        this.name_ = app_info.get_display_name();
        this.desktop_name = app_info.get_name();
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

    executable(): string {
        return this.executable_.get_or_init(() => this.app_info.get_executable());
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

    name(): string {
        return this.name_;
    }

    should_show(): boolean {
        return this.should_show_.get_or_init(() => this.app_info.should_show());
    }

    launch(): Result<null, error.Error> {
        return this.app_info.launch([], null)
            ? Ok(null)
            : Err(new error.Error(`failed to launch ${this.filename}`));
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

export function* load_desktop_entries(): IterableIterator<AppInfo> {
    const entries: Array<any> = Gio.AppInfo.get_all();
    for (const entry of entries) {
        if (entry.should_show()) {
            yield new AppInfo(entry);
        }
    }
}
