//@ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, GLib } = imports.gi;

import * as error from 'error';
import * as log from 'log';
import * as result from 'result';

import type { Result } from 'result';
import type { Error } from 'error';

const { Err, Ok } = result;

const CONF_DIR: string = GLib.get_home_dir() + "/.config/pop-shell"
export var CONF_FILE: string = CONF_DIR + "/config.json"

export const DEFAULT_RULES: Array<FloatRule> = [
    { class: "Authy Desktop", },
    { class: "Enpass", title: "Enpass Assistant" },
    { class: "Zotero", title: "Quick Format Citation" },
    { class: "Com.github.donadigo.eddy", },
    { class: "Conky", },
    { class: "Gnome-screenshot", },
    { class: "jetbrains-toolbox", },
    { class: "KotatogramDesktop", title: "Media viewer" },
    { class: "Steam", title: "^((?!Steam).)*$" },
    { class: "TelegramDesktop", title: "Media viewer" },
]

export interface FloatRule {
    class?: string;
    title?: string;
}

export class Config {
    /** List of windows that should float, regardless of their WM hints */
    float: Array<FloatRule> = [];

    /** Logs window details on focus of window */
    log_on_focus: boolean = false;

    floating(): Array<FloatRule> {
        return DEFAULT_RULES.concat(this.float)
    }

    window_shall_float(wclass: string, title: string): boolean {
        return this.floating().find((rule) => {
            if (rule.class) {
                if (!new RegExp(rule.class).test(wclass)) {
                    return false;
                }
            }

            if (rule.title) {
                if (!new RegExp(rule.title).test(title)) {
                    return false;
                }
            }

            return true;
        }) !== undefined;
    }

    reload() {
        const conf = Config.from_config();

        if (conf.kind === 2) {
            log.error(`failed to open pop-shell config: ${conf.value.format()}`);
            return;
        }

        this.float = conf.value.float;
        this.log_on_focus = conf.value.log_on_focus;
    }

    to_json(): string {
        return JSON.stringify(this, undefined, 2);
    }

    static from_json(json: string): Config {
        try {
            return JSON.parse(json);
        } catch (error) {
            log.error(`failed to parse config: ${error}`);
            return new Config();
        }
    }

    private static from_config(): Result<Config, Error> {
        const stream = Config.read();
        return stream.kind === 2 ? stream : Ok(Config.from_json(stream.value));
    }

    private static gio_file(): Result<any, Error> {
        try {
            const conf = Gio.File.new_for_path(CONF_FILE);

            if (!conf.query_exists(null)) {
                const dir = Gio.File.new_for_path(CONF_DIR);
                if (!dir.query_exists(null) && !dir.make_directory(null)) {
                    return Err(new error.Error('failed to create pop-shell config directory'));
                }

                const example = new Config();
                example.float.push({ class: "pop-shell-example", title: "pop-shell-example" });

                conf.create(Gio.FileCreateFlags.NONE, null)
                    .write_all(JSON.stringify(example, undefined, 2), null);
            }

            return Ok(conf);
        } catch (why) {
            return Err(new error.Error(`Gio.File I/O error: ${why}`));
        }
    }

    private static read(): Result<string, Error> {
        try {
            const file = Config.gio_file();
            if (file.kind === 2) return file;

            const [, buffer] = file.value.load_contents(null);

            return Ok(imports.byteArray.toString(buffer));
        } catch (why) {
            return Err(new error.Error(`failed to read pop-shell config: ${why}`));
        }
    }

    private static write(data: string): Result<void, Error> {
        try {
            const file = Config.gio_file();
            if (file.kind === 2) return file;

            file.value.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null)

            return Ok(void (0));
        } catch (why) {
            return Err(new error.Error(`failed to write to config: ${why}`));
        }
    }

    sync_to_disk() {
        const result = Config.write(this.to_json());
        if (result.kind === 2) {
            log.error(`failed to sync disk to config: ${result.value.format()}`);
        }
    }
}
