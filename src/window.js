const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gdk, Meta, Shell, St } = imports.gi;
const Log = Me.imports.log;
const Util = imports.misc.util;

const MOTIF_HINTS = '_MOTIF_WM_HINTS';
const HIDE_FLAGS = ['0x2', '0x0', '0x2', '0x0', '0x0'];
const SHOW_FLAGS = ['0x2', '0x0', '0x1', '0x0', '0x0'];

/// Activates a window, and moves the mouse point to the center of it.
function activate(win) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());
    place_pointer_on(win)
}

function place_pointer_on(win) {
    let rect = win.get_frame_rect();
    let x = rect.x + 8;
    let y = rect.y + 8;

    let display = Gdk.DisplayManager.get().get_default_display();

    display.get_default_seat()
        .get_pointer()
        .warp(display.get_default_screen(), x, y);
}

const window_tracker = Shell.WindowTracker.get_default();

var ShellWindow = class ShellWindow {
    constructor(entity, window, ext) {
        this._window_app = null;
        this.ext = ext;

        this.entity = entity;
        this.meta = window;

        if (!window.is_client_decorated()) {
            if (ext.settings.show_title()) {
                log(`showing decorations`);
                this.decoration_show();
            } else {
                log(`hiding decorations`);
                this.decoration_hide();
            }
        }
    }

    activate() {
        activate(this.meta);
    }

    decoration_hide() {
        set_hint(this.xid(), MOTIF_HINTS, HIDE_FLAGS);
    }

    decoration_show() {
        set_hint(this.xid(), MOTIF_HINTS, SHOW_FLAGS);
    }

    icon(size) {
        return this.ext.icons.get_or(this.entity, () => {
            let app = this.window_app();
            if (!app) return null;

            let icon = app.create_icon_texture(size);

            if (!icon) {
                icon = new St.Icon({
                    icon_name: 'applications-other',
                    icon_type: St.IconType.FULLCOLOR,
                    icon_size: size
                });
            }

            return icon;
        });
    }

    is_tilable() {
        return this.ext.tilable.get_or(this.entity, () => {
            return !this.meta.is_skip_taskbar()
                && !blacklisted(this.meta.get_wm_class())
                && this.meta.window_type == Meta.WindowType.NORMAL;
        });
    }

    move(rect) {
        this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
        this.meta.unmaximize(Meta.MaximizeFlags.VERTICAL);
        this.meta.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

        this.meta.move_resize_frame(
            true,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
    }

    move_snap(rect) {
        this.move(rect);
        this.ext.tiler.snap(this);
    }

    name() {
        return this.ext.names.get_or(this.entity, () => {
            try {
                return this.window_app().get_name().replace(/&/g, "&amp;");
            } catch (e) {
                return "unknown";
            }
        });
    }

    swap(other) {
        let ar = this.meta.get_frame_rect();
        let br = other.meta.get_frame_rect();

        this.move(br);
        other.move(ar);
        place_pointer_on(this.meta);
    }

    window_app() {
        if (!this._window_app) {
            this._window_app = window_tracker.get_window_app(this.meta)
        }

        return this._window_app;
    }

    xid() {
        const desc = this.meta.get_description();
        const match = desc && desc.match(/0x[0-9a-f]+/);
        return match && match[0];
    }
}

function blacklisted(window_class) {
    Log.debug(`window class: ${window_class}`);
    return ['Conky', 'Gnome-screenshot'].includes(window_class);
}

function set_hint(xid, hint, value) {
    Util.spawn(['xprop', '-id', xid, '-f', hint, '32c', '-set', hint, value.join(', ')]);
}
