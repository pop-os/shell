const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gdk, Meta, Shell, St } = imports.gi;
const Log = Me.imports.log;

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
    }

    activate() {
        activate(this.meta);
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
}

function blacklisted(window_class) {
    Log.debug(`window class: ${window_class}`);
    return ['Conky', 'Gnome-screenshot'].includes(window_class);
}
