const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gdk, Meta, Shell, St } = imports.gi;

const { place_window } = Me.imports.tiling;

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

function swap(a, b) {
    let ar = a.get_frame_rect();
    let br = b.get_frame_rect();

    place_window(a, br);
    place_window(b, ar);
    place_pointer_on(a);
}

var ShellWindow = class ShellWindow {
    constructor(window) {
        this._icon = null;
        this._name = null;
        this._window_tracker = Shell.WindowTracker.get_default();
        this._window_app = null;

        this.window = window;
    }
    
    activate() {
        activate(this.window);
    }

    icon(size) {
        if (!this._icon) {
            this._icon = this.window_app().create_icon_texture(size);

            if (!this._icon) {
                this._icon = new St.Icon({
                    icon_name: 'applications-other',
                    icon_type: St.IconType.FULLCOLOR,
                    icon_size: size
                });
            }
        }

        return this._icon;
    }

    is_tilable() {
        if (this.window.is_skip_taskbar()) {
            return;
        }

        if (blacklisted(this.window.get_wm_class())) {
            return
        }

        return this.window['window-type'] == Meta.WindowType.NORMAL;
    }

    name() {
        if (!this._name) {
            try {
                this._name = this.window_app().get_name().replace(/&/g, "&amp;");
            } catch (e) {
                log("window_app_name: " + e);
                this._name = "unknown";
            }
        }

        return this._name;
    }

    swap(other) {
        swap(this.window, other.window);
    }

    window_app() {
        if (!this._window_app) {
            this._window_tracker.get_window_app(window)
        }

        return this._window_app;
    }
}

function blacklisted(window_class) {
    return ['Conky'].includes(window_class);
}
