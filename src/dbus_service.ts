const { Gio } = imports.gi

const IFACE: string = `
<node>
  <interface name="com.System76.PopShell">
    <method name="FocusLeft"/>
    <method name="FocusRight"/>
    <method name="FocusUp"/>
    <method name="FocusDown"/>
    <method name="Launcher"/>
  </interface>
</node>`

export class Service {
    dbus: any
    id: any

    FocusLeft: () => void = () => {}
    FocusRight: () => void = () => {}
    FocusUp: () => void = () => {}
    FocusDown: () => void = () => {}
    Launcher: () => void = () => {}

    constructor() {
        this.dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this)

        const onBusAcquired = (conn: any) => {
            this.dbus.export(conn, '/com/System76/PopShell');
        }

        function onNameAcquired() {}

        function onNameLost() {}

        this.id = Gio.bus_own_name(
            Gio.BusType.SESSION,
            'com.System76.PopShell',
            Gio.BusNameOwnerFlags.NONE,
            onBusAcquired,
            onNameAcquired,
            onNameLost
        )
    }

    destroy() {
        Gio.bus_unown_name(this.id)
    }
}