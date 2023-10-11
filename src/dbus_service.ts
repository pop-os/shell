import Gio from 'gi://Gio';

const IFACE: string = `<node>
  <interface name="com.System76.PopShell">
    <method name="FocusLeft"/>
    <method name="FocusRight"/>
    <method name="FocusUp"/>
    <method name="FocusDown"/>
    <method name="Launcher"/>
    <method name="WindowFocus">
        <arg type="(uu)" direction="in" name="window"/>
    </method>
    <method name="WindowHighlight">
        <arg type="(uu)" direction="in" name="window"/>
    </method>
    <method name="WindowList">
        <arg type="a((uu)sss)" direction="out" name="args"/>
    </method>
    <method name="WindowQuit">
        <arg type="(uu)" direction="in" name="window"/>
    </method>
  </interface>
</node>`;

export class Service {
    dbus: any;
    id: any;

    FocusLeft: () => void = () => {};
    FocusRight: () => void = () => {};
    FocusUp: () => void = () => {};
    FocusDown: () => void = () => {};
    Launcher: () => void = () => {};
    WindowFocus: (window: [number, number]) => void = () => {};
    WindowList: () => Array<[[number, number], string, string, string]> = () => [];
    WindowQuit: (window: [number, number]) => void = () => {};

    constructor() {
        this.dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);

        const onBusAcquired = (conn: any) => {
            this.dbus.export(conn, '/com/System76/PopShell');
        };

        function onNameAcquired() {}

        function onNameLost() {}

        this.id = Gio.bus_own_name(
            Gio.BusType.SESSION,
            'com.System76.PopShell',
            Gio.BusNameOwnerFlags.NONE,
            onBusAcquired,
            onNameAcquired,
            onNameLost,
        );
    }

    destroy() {
        Gio.bus_unown_name(this.id);
    }
}
