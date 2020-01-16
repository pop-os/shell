const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;

var Geom = Me.imports.geom;
var Window = Me.imports.window;

function current_monitor() {
    return global.display.get_monitor_geometry(global.display.get_current_monitor());
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

/// Useful in the event that you want to reuse an actor in the future
function recursive_remove_children(actor) {
    for (const child of get_children(actor)) {
        recursive_remove_children(child);
    }

    actor.remove_all_children();
}

function log(text) {
    global.log("pop-shell: " + text);
}

function round_increment(value, increment) {
    return Math.round(value / increment) * increment;
}
