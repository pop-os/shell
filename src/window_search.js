const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, GObject, Meta, Shell } = imports.gi;
const { Window } = Me.imports.lib;
const { Search } = Me.imports.search;
const { uiGroup } = imports.ui.main;
const { ShellWindow } = Window;

var WindowSearch = GObject.registerClass(
    class WindowSearch extends Search {
        _init(ext) {
            this.windows = [];

            let search = (pattern) => {
                this.windows = [];

                return ext.tab_list(Meta.TabList.NORMAL, null)
                    .slice(0, 5)
                    .map((win) => {
                        var name = win.name();
                        let title = win.meta.get_title();

                        if (name != title) {
                            name += ": " + title;
                        }

                        name = name.toLowerCase();

                        if (!name.includes(pattern)) {
                            return null;
                        }

                        this.windows.push(win);

                        return [name, win.icon(32)];
                    })
                    .filter((win) => null != win);
            };

            let apply = (id) => this.windows[id].activate();

            super._init(search, apply);
        }
    }
);
