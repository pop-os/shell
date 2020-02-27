const Me = imports.misc.extensionUtils.getCurrentExtension();

const { St } = imports.gi;

export class Box {
    container: any;

    constructor(args: Object | null) {
        this.container = new St.BoxLayout(args);
    }

    add(child: any, args: Object | null): Box {
        this.container.add(child, args);
        return this;
    }
}
