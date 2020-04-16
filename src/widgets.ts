const { St } = imports.gi;

export class Box {
    container: any;

    constructor(args: Object | null) {
        this.container = new St.BoxLayout(args);
    }

    add(child: any): Box {
        this.container.add_child(child);
        return this;
    }
}
