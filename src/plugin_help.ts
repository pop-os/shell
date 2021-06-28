// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension()

import * as plugins from 'launcher_plugins'

import type { Response, Selection } from 'launcher_plugins'
import type { Ext } from './extension'

export class ShellBuiltin extends plugins.Builtin {
    init() {}

    query(ext :Ext, _: string): Response.Response {
        let selections = []
        let id = 0;

        for (const [name, service] of ext.window_search.service.plugins) {
            if (service.config.pattern?.length > 0) {
                selections.push({
                    id,
                    name,
                    description: service.config.description + `: ${service.config.pattern}`,
                })
                id += 1;
            }
        }

        return {
            event: "queried",
            selections
        }
    }

    submit(ext: Ext, id: number): Response.Response {
        return { event: "fill", text: "" }
    }
}