declare const log: (arg: string) => void, imports: any, _: (arg: string) => string;

declare module 'gi://*' {
    let data: any;
    export default data;
}

declare module 'gi://Gtk?version=3.0' {
    let Gtk: any;
    export default Gtk;
}
