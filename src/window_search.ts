const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GObject, Meta } = imports.gi;

import * as Search from 'search';

import type { ShellWindow } from 'window';
import type { Ext } from './extension';

const LIST_MAX = 5;
const ICON_SIZE = 32;

export class WindowSearch extends Search.Search {
    windows: Array<ShellWindow>;
    active: Array<[string, any]>;

    constructor(ext: Ext) {
        let cancel = () => {
            ext.overlay.visible = false;
        };

        let search = (pattern: string): Array<[string, any]> | null => {
            this.windows.splice(0);
            this.active.splice(0);

            if (pattern.length == 0) {
                ext.overlay.visible = false;
                return null;
            }

            let window_list = ext.tab_list(Meta.TabList.NORMAL, null);
            window_list.sort((a: ShellWindow, b: ShellWindow) => a.name(ext) > b.name(ext) ? 1 : 0);

            for (const win of window_list) {
                let name = win.name(ext);
                let title = win.meta.get_title();

                if (name != title) {
                    name += ": " + title;
                }

                if (!name.toLowerCase().includes(pattern)) {
                    continue
                }

                this.windows.push(win);
                this.active.push([name, win.icon(ext, ICON_SIZE)]);
                if (this.active.length == LIST_MAX) {
                    break
                }
            }

            return this.active;
        };

        let select = (id: number) => {
            if (id <= this.windows.length) return;

            let rect = this.windows[id].rect();
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

        super(cancel, search, select, apply);
        this.windows = new Array();
        this.active = new Array();
    }
}
