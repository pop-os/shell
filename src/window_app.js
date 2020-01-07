const { Shell, St } = imports.gi;

var WindowApp = class WindowApp {
    constructor(win) {
        this.app = Shell.WindowTracker.get_default().get_window_app(win);
    }

    icon(size) {
        var icon = this.app.create_icon_texture(size);

        if (!icon) {
            icon = new St.Icon({
                icon_name: 'applications-other',
                icon_type: St.IconType.FULLCOLOR,
                icon_size: size
            });
        }

        return icon;
    }

    name() {
        let name = null;
        try {
            name = this.app.get_name().replace(/&/g, "&amp;");
        } catch (e) {
            log("window_app_name: " + e);
        }
        return name;
    }
}
