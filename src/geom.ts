import type { Rectangle } from "./rectangle";

export function xend(rect: Rectangle) {
    return rect.x + rect.width;
}

export function xcenter(rect: Rectangle) {
    return rect.x + rect.width / 2;
}

export function yend(rect: Rectangle) {
    return rect.y + rect.height;
}

export function ycenter(rect: Rectangle) {
    return rect.y + rect.height / 2;
}

export function center(rect: Rectangle) {
    return [xcenter(rect), ycenter(rect)];
}

export function north(rect: Rectangle) {
    return [xcenter(rect), rect.y];
}

export function east(rect: Rectangle) {
    return [xend(rect), ycenter(rect)];
}

export function south(rect: Rectangle) {
    return [xcenter(rect), yend(rect)];
}

export function west(rect: Rectangle) {
    return [rect.x, ycenter(rect)];
}

export function directional_distance(win_a: any, win_b: any, fn_a: any, fn_b: any) {
    let [ax, ay] = fn_a(win_a.get_frame_rect());
    let [bx, by] = fn_b(win_b.get_frame_rect());

    return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2));
}

export function window_distance(win_a: any, win_b: any) {
    return directional_distance(win_a, win_b, center, center);
}

export function upward_distance(win_a: any, win_b: any) {
    return directional_distance(win_a, win_b, south, north);
}

export function rightward_distance(win_a: any, win_b: any) {
    return directional_distance(win_a, win_b, west, east);
}

export function downward_distance(win_a: any, win_b: any) {
    return directional_distance(win_a, win_b, north, south);
}

export function leftward_distance(win_a: any, win_b: any) {
    return directional_distance(win_a, win_b, east, west);
}
