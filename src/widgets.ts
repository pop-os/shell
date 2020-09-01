const { Clutter, Pango, St } = imports.gi;

export class Box {
    container: any;

    constructor(args: Object) {
        this.container = new St.BoxLayout(args);
    }

    add(child: any): Box {
        this.container.add_child(child);
        return this;
    }
}

export function application_button(title: string, category_icon: St.Widget, app_icon: St.Widget): St.Widget {
    let layout = new Box({});
    category_icon.set_y_align(Clutter.ActorAlign.CENTER);
    app_icon.set_y_align(Clutter.ActorAlign.CENTER);

    let label = new St.Label({
        text: title,
        styleClass: "pop-shell-search-label",
        y_align: Clutter.ActorAlign.CENTER
    });

    label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    layout.add(category_icon).add(app_icon).add(label);
    let container = new St.Button({ styleClass: "pop-shell-search-element" });
    container.add_actor(layout.container);
    return container;
}
