// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

import * as plugins from 'launcher_plugins'
import * as service from 'launcher_service'

import type { Response, Selection } from 'launcher_plugins'
import type { Ext } from './extension'

export class ShellBuiltin extends plugins.Builtin {
    selections: Array<Selection> = []

    init() {}

    query(ext :Ext, _: string): Response.Response {
        this.selections.splice(0);
        let id = 0;

        const files = new Map([[service.BUILTIN_FILES.config.name, service.BUILTIN_FILES]])
        for (const map of [files, ext.window_search.service.plugins]) {
            for (const [name, service] of map) {
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