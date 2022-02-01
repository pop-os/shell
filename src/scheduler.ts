// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as log from 'log';

const Gio = imports.gi.Gio;

const SchedulerInterface = '<node>\
<interface name="com.system76.Scheduler"> \
    <method name="SetForegroundProcess"> \
        <arg name="pid" type="u" direction="in"/> \
    </method> \
</interface> \
</node>';

const SchedulerProxy = Gio.DBusProxy.makeProxyWrapper(SchedulerInterface)

const SchedProxy = new SchedulerProxy(
    Gio.DBus.system,
    "com.system76.Scheduler",
    "/com/system76/Scheduler"
)

let foreground: number = 0

export function setForeground(win: Meta.Window) {
    const pid = win.get_pid()
    if (pid) {
        if (foreground === pid) return
        foreground = pid

        try {
            log.debug(`setting priority for ${win.get_title()}`)
            SchedProxy.SetForegroundProcessRemote(pid)
        } catch (_) {}
    }
}