const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const { Meta, St } = imports.gi;

var Geom = Me.imports.geom;
var Window = Me.imports.window;

function current_monitor() {
    return global.display.get_monitor_geometry(global.display.get_current_monitor());
}

// Fetch a `Meta.Rectangle` that represents the pointer.
function cursor_rect() {
    let [x, y] = global.get_pointer();
    return new Meta.Rectangle({ x: x, y: y, width: 1, height: 1 });
}

/// Missing from the Clutter API is an Actor children iterator
function* get_children(actor) {
    let nth = 0;
    let children = actor.get_n_children();

    while (nth < children) {
        yield actor.get_child_at_index(nth);
        nth += 1;
    }
}

function join(iterable, next_func, between_func) {
    let iterator = iterable.values();
    let first = iterator.next().value;
    if (first) {
        next_func(first);
        for (const item of iterator) {
            between_func();
            next_func(item);
        }
    }
}

function log(text) {
    global.log("pop-shell: " + text);
}

/// Useful in the event that you want to reuse an actor in the future
function recursive_remove_children(actor) {
    for (const child of get_children(actor)) {
        recursive_remove_children(child);
    }

    actor.remove_all_children();
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}

function separator() {
    return new St.BoxLayout({ styleClass: 'pop-shell-separator', x_expand: true });
}
