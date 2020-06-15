const { Clutter, Pango, St } = imports.gi;

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

export class ApplicationBox extends Box {
    constructor(title: string, category_icon: St.Widget, app_icon: St.Widget) {
        super({ styleClass: "pop-shell-search-element" });
        category_icon.set_y_align(Clutter.ActorAlign.CENTER);
        app_icon.set_y_align(Clutter.ActorAlign.CENTER);

        let label = new St.Label({
            text: title,
            styleClass: "pop-shell-search-label",
            y_align: Clutter.ActorAlign.CENTER
        });

        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this.add(category_icon)
            .add(app_icon)
            .add(label);
    }
}
