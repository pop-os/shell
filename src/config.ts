const { Gio, GLib } = imports.gi;

const CONF_DIR: string = GLib.get_user_config_dir() + "/pop-shell"
export var CONF_FILE: string = CONF_DIR + "/config.json"

export interface FloatRule {
    class?: string;
    title?: string;
    disabled?: boolean;
}

interface Ok<T> {
    tag: 0
    value: T
}

interface Error {
    tag: 1
    why: string
}

type Result<T> = Ok<T> | Error;

export const DEFAULT_FLOAT_RULES: Array<FloatRule> = [
    { class: "Authy Desktop" },
    { class: "Com.github.amezin.ddterm" },
    { class: "Com.github.donadigo.eddy" },
    { class: "Conky" },
    { title: "Discord Updater" },
    { class: "Enpass", title: "Enpass Assistant" },
    { class: "Floating Window Exceptions" },
    { class: "Gjs", title: "Settings" },
    { class: "Gnome-initial-setup" },
    { class: "Gnome-terminal", title: "Preferences – General" },
    { class: "Guake" },
    { class: "Io.elementary.sideload" },
    { title: "JavaEmbeddedFrame" },
    { class: "KotatogramDesktop", title: "Media viewer" },
    { class: "Mozilla VPN" },
    { class: "update-manager", title: "Software Updater" },
    { class: "Solaar" },
    { class: "Steam", title: "^(?!Steam).*$" },
    { class: "Steam", title: "^.*(Guard|Login).*" },
    { class: "TelegramDesktop", title: "Media viewer" },
    { class: "Zotero", title: "Quick Format Citation" },
    { class: "firefox", title: "^(?!.*Mozilla Firefox).*$" },
    { class: "gjs" },
    { class: "gnome-screenshot" },
    { class: "ibus-.*" },
    { class: "jetbrains-toolbox" },
    { class: "jetbrains-webstorm", title: "Customize WebStorm" },
    { class: "jetbrains-webstorm", title: "License Activation" },
    { class: "jetbrains-webstorm", title: "Welcome to WebStorm" },
    { class: "krunner" },
    { class: "pritunl" },
    { class: "re.sonny.Junction" },
    { class: "system76-driver" },
    { class: "tilda" },
    { class: "zoom" },
    { class: "^.*action=join.*$"}

];

export interface WindowRule {
    class?: string;
    title?: string;
    disabled?: boolean;
}

/**
 * These windows will skip showing in Overview, Thumbnails or SwitcherList
 * And any rule here should be added on the DEFAULT_RULES above
 */
export const SKIPTASKBAR_EXCEPTIONS: Array<WindowRule> = [
    { class: "Conky", },
    { class: "Guake", },
    { class: "Com.github.amezin.ddterm", },
    { class: "plank", },
];

export interface FloatRule {
    class?: string;
    title?: string;
};

export class Config {
    /** List of windows that should float, regardless of their WM hints */
    float: Array<FloatRule> = [];

    /**
     * List of Windows with skip taskbar true but still hidden in Overview,
     * Switchers, Workspace Thumbnails
     */
    skiptaskbarhidden: Array<WindowRule> = [];

    /** Logs window details on focus of window */
    log_on_focus: boolean = false;

    /** Add a floating exception which matches by wm_class */
    add_app_exception(wmclass: string) {
        for (const r of this.float) {
            if (r.class === wmclass && r.title === undefined) return;
        }

        this.float.push({ class: wmclass });
        this.sync_to_disk();
    }

    /** Add a floating exception which matches by wm_title */
    add_window_exception(wmclass: string, title: string) {
        for (const r of this.float) {
            if (r.class === wmclass && r.title === title) return;
        }

        this.float.push({ class: wmclass, title });
        this.sync_to_disk();
    }

    window_shall_float(wclass: string, title: string): boolean {
        for (const rule of this.float.concat(DEFAULT_FLOAT_RULES)) {
            if (rule.class) {
                if (!new RegExp(rule.class, 'i').test(wclass)) {
                    continue
                }
            }

            if (rule.title) {
                if (!new RegExp(rule.title, 'i').test(title)) {
                    continue
                }
            }

            return rule.disabled ? false : true;
        }

        return false;
    }

    skiptaskbar_shall_hide(meta_window: any) {
        let wmclass = meta_window.get_wm_class();
        let wmtitle = meta_window.get_title();

        if (!meta_window.is_skip_taskbar()) return false;

        for (const rule of this.skiptaskbarhidden.concat(SKIPTASKBAR_EXCEPTIONS)) {
            if (rule.class) {
                if (!new RegExp(rule.class, 'i').test(wmclass)) {
                    continue
                }
            }

            if (rule.title) {
                if (!new RegExp(rule.title, 'i').test(wmtitle)) {
                    continue
                }
            }

            return rule.disabled ? false : true;
        }

        return false;
    }

    reload() {
        const conf = Config.from_config();

        if (conf.tag === 0) {
            let c = conf.value;
            this.float = c.float;
            this.log_on_focus = c.log_on_focus;
        } else {
            log(`error loading conf: ${conf.why}`)
        }
    }

    rule_disabled(rule: FloatRule): boolean {
        for (const value of this.float.values()) {
            if (value.disabled && rule.class === value.class && value.title === rule.title) {
                return true
            }
        }

        return false;
    }

    to_json(): string {
        return JSON.stringify(this, set_to_json, 2);
    }

    toggle_system_exception(wmclass: string | undefined, wmtitle: string | undefined, disabled: boolean) {
        if (disabled) {
            for (const value of DEFAULT_FLOAT_RULES) {
                if (value.class === wmclass && value.title === wmtitle) {
                    value.disabled = disabled;
                    this.float.push(value);
                    this.sync_to_disk();
                    return;
                }
            }
        }

        let index = 0;
        let found = false;
        for (const value of this.float) {
            if (value.class === wmclass && value.title === wmtitle) {
                found = true;
                break
            }
            index += 1;
        }

        if (found) swap_remove(this.float, index)

        this.sync_to_disk();
    }

    remove_user_exception(wmclass: string | undefined, wmtitle: string | undefined) {
        let index = 0
        let found = new Array();
        for (const value of this.float.values()) {
            if (value.class === wmclass && value.title === wmtitle) {
                found.push(index)
            }

            index += 1
        }

        if (found.length !== 0) {
            for (const idx of found) swap_remove(this.float, idx)

            this.sync_to_disk()
        }
    }

    static from_json(json: string): Config {
        try {
            return JSON.parse(json);
        } catch (error) {
            return new Config();
        }
    }

    private static from_config(): Result<Config> {
        const stream = Config.read();
        if (stream.tag === 1) return stream;
        let value = Config.from_json(stream.value)
        return { tag: 0, value }
    }

    private static gio_file(): Result<any> {
        try {
            const conf = Gio.File.new_for_path(CONF_FILE);

            if (!conf.query_exists(null)) {
                const dir = Gio.File.new_for_path(CONF_DIR);
                if (!dir.query_exists(null) && !dir.make_directory(null)) {
                    return { tag: 1, why: 'failed to create pop-shell config directory' }
                }

                const example = new Config();
                example.float.push({ class: "pop-shell-example", title: "pop-shell-example" });

                conf.create(Gio.FileCreateFlags.NONE, null)
                    .write_all(JSON.stringify(example, undefined, 2), null);
            }

            return { tag: 0, value: conf };
        } catch (why) {
            return { tag: 1, why: `Gio.File I/O error: ${why}` }
        }
    }

    private static read(): Result<string> {
        try {
            const file = Config.gio_file();
            if (file.tag === 1) return file;

            const [, buffer] = file.value.load_contents(null);

            return { tag: 0, value: imports.byteArray.toString(buffer) }
        } catch (why) {
            return { tag: 1, why: `failed to read pop-shell config: ${why}` };
        }
    }

    private static write(data: string): Result<null> {
        try {
            const file = Config.gio_file();
            if (file.tag === 1) return file;

            file.value.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null)

            return { tag: 0, value: file.value }
        } catch (why) {
            return { tag: 1, why: `failed to write to config: ${why}` };
        }
    }

    sync_to_disk() {
        Config.write(this.to_json());
    }
}

function set_to_json(_key: string, value: any) {
    if (typeof value === 'object' && value instanceof Set) {
        return [...value];
    }
    return value;
}

function swap_remove<T>(array: Array<T>, index: number): T | undefined {
    array[index] = array[array.length - 1];
    return array.pop();
}
