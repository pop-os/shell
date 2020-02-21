const Me = imports.misc.extensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const { Meta, St } = imports.gi;

var Geom = Me.imports.geom;
var Window = Me.imports.window;

var MODE_AUTO_TILE = 0;
var MODE_DEFAULT = 1;

var MOVEMENT_NONE   = 0
var MOVEMENT_MOVED  = 0b1;
var MOVEMENT_GROW   = 0b10;
var MOVEMENT_SHRINK = 0b100;
var MOVEMENT_LEFT   = 0b1000;
var MOVEMENT_UP     = 0b10000;
var MOVEMENT_RIGHT  = 0b100000;
var MOVEMENT_DOWN   = 0b1000000;

var ORIENTATION_HORIZONTAL = 0;
var ORIENTATION_VERTICAL = 1;

function fmt_rect(rect) {
    return `Rect(${[rect.x, rect.y, rect.width, rect.height]})`;
}

function ok(input, func) {
    return input ? func(input) : null;
}

function ok_or_else(input, ok_func, or_func) {
    return input ? ok_func(input) : or_func();
}

function or_else(input, func) {
    return input ? input : func();
}

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
    ok(iterator.next().value, (first) => {
        next_func(first);

        for (const item of iterator) {
            between_func();
            next_func(item);
        }
    });
}

function is_move_op(op) {
    return [Meta.GrabOp.WINDOW_BASE, Meta.GrabOp.MOVING, Meta.GrabOp.KEYBOARD_MOVING].includes(op);
}

function meta_rect_clamp(reference, rect, outer_gap) {
    rect.x = Math.max(0, rect.x);
    rect.y = Math.max(0, rect.y);

    const xend = rect.x + rect.width;
    const work_width = reference.width - outer_gap;
    if (xend > work_width) {
        rect.width = work_width - rect.x;
    }

    const yend = rect.y + rect.height;
    const work_height = reference.height - outer_gap;
    if (yend > work_height) {
        rect.height = work_height - rect.y;
    }
}

function orientation_as_str(value) {
    return value == 0 ? "Orientation::Horizontal" : "Orientation::Vertical";
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
