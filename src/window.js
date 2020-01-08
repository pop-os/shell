const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gdk } = imports.gi;

const { snap } = Me.imports.tiling;

/// Activates a window, and moves the mouse point to the center of it.
function activate(win) {
    win.raise();
    win.unminimize();
    win.activate(global.get_current_time());
    place_pointer_on(win)
}

function place_pointer_on(win) {
    let rect = win.get_frame_rect();
    let x = rect.x + 8;
    let y = rect.y + 8;

    let display = Gdk.DisplayManager.get().get_default_display();

    display.get_default_seat()
        .get_pointer()
        .warp(display.get_default_screen(), x, y);
}

function swap(a, b) {
    let ar = a.get_frame_rect();
    let br = b.get_frame_rect();

    snap(a, br);
    snap(b, ar);
    place_pointer_on(a);
}
