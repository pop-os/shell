// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

import * as plugins from 'launcher_plugins'

import type { Response, Selection } from 'launcher_plugins'
import type { Ext } from './extension'

export class ShellBuiltin extends plugins.Builtin {
    selections: Array<Selection> = []

    init() {}

    query(ext :Ext, _: string): Response.Response {
        this.selections.splice(0);
        let id = 0;

        for (const [name, service] of ext.window_search.service.plugins) {
            if (service.config.pattern?.length > 0) {
                const example = service.config.examples
                    ? service.config.examples
                    : service.config.pattern;

                this.selections.push({
                    id,
                    name,
                    description: service.config.description + `: ${example}`,
                    fill: service.config.fill
                })
                id += 1;
            }
        }

        return {
            event: "queried",
            selections: this.selections
        }
    }

    submit(_: Ext, id: number): Response.Response {
        const selection = this.selections[id];

        let text = ""
        if (selection) {
            if (selection.fill) {
                text = selection.fill;
            }
        }

        return { event: "fill", text }
    }
}