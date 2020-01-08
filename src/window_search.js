const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, GObject, Meta, Shell } = imports.gi;
const { Window } = Me.imports.lib;
const { Search } = Me.imports.search;
const { uiGroup } = imports.ui.main;
const { WindowApp } = Me.imports.window_app;

var WindowSearch = GObject.registerClass(
    class WindowSearch extends Search {
        _init() {
            this.windows = [];

            let search = (pattern) => {
                this.windows = [];

                return global.display.get_tab_list(Meta.TabList.NORMAL, null)
                    .slice(0, 5)
                    .map((win) => {
                        let app = new WindowApp(win);

                        var name = app.name();
                        let title = win.get_title();

                        if (name != title) {
                            name += ": " + title;
                        }

                        name = name.toLowerCase();

                        if (!name.includes(pattern)) {
                            return null;
                        }

                        this.windows.push(win);

                        return [name, app.icon(32)];
                    })
                    .filter((app) => null != app);
            };

            let apply = (id) => Window.activate(this.windows[id]);

            super._init(search, apply);
        }
    }
);
