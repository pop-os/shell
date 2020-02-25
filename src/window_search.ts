const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GObject, Meta } = imports.gi;

import * as Search from 'search';

import { ShellWindow } from 'window';
import { Ext } from './extension';

const LIST_MAX = 5;
const ICON_SIZE = 32;

export var WindowSearch = GObject.registerClass(
    class WindowSearch extends Search.Search {
        private windows: Array<ShellWindow>;
        private active: Array<[string, any]>;

        constructor() {
            super();
            this.windows = [];
            this.active = [];
        }

        _init(ext: Ext) {
            this.windows = [];
            this.active = [];

            let cancel = () => {
                ext.overlay.visible = false;
            };

            let search = (pattern: string) => {
                this.windows.splice(0);
                this.active.splice(0);

                let window_list = ext.tab_list(Meta.TabList.NORMAL, null);
                window_list.sort((a: ShellWindow, b: ShellWindow) => a.name() > b.name() ? 1 : 0);

                for (const win of window_list) {
                    let name = win.name();
                    let title = win.meta.get_title();

                    if (name != title) {
                        name += ": " + title;
                    }

                    if (!name.toLowerCase().includes(pattern)) {
                        continue
                    }

                    this.windows.push(win);
                    this.active.push([name, win.icon(ICON_SIZE)]);
                    if (this.active.length == LIST_MAX) {
                        break
                    }
                }

                return this.active;
            };

            let select = (id: number) => {
                let rect = this.windows[id].meta.get_frame_rect();
                ext.overlay.x = rect.x
                ext.overlay.y = rect.y;
                ext.overlay.width = rect.width;
                ext.overlay.height = rect.height;
                ext.overlay.visible = true;
            };

            let apply = (id: number) => {
                this.windows[id].activate();
                ext.overlay.visible = false;
            };

            super._init(cancel, search, select, apply);
        }
    }
);
