function xend(rect) {
    return rect.x + rect.width;
}

function xcenter(rect) {
    return rect.x + rect.width / 2;
}

function yend(rect) {
    return rect.y + rect.height;
}

function ycenter(rect) {
    return rect.y + rect.height / 2;
}

function center(rect) {
    return [xcenter(rect), ycenter(rect)];
}

function north(rect) {
    return [xcenter(rect), rect.y];
}

function east(rect) {
    return [xend(rect), ycenter(rect)];
}

function south(rect) {
    return [xcenter(rect), yend(rect)];
}

function west(rect) {
    return [rect.x, ycenter(rect)];
}

function directional_distance(win_a, win_b, fn_a, fn_b) {
    let [ax, ay] = fn_a(win_a.get_frame_rect());
    let [bx, by] = fn_b(win_b.get_frame_rect());

    return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2));
}

function window_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, center, center);
}

function upward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, south, north);
}

function rightward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, west, east);
}

function downward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, north, south);
}

function leftward_distance(win_a, win_b) {
    return directional_distance(win_a, win_b, east, west);
}
