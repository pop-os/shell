import type {Ext} from 'extension';

export enum Side {
    LEFT,
    TOP,
    RIGHT,
    BOTTOM,
    CENTER
}

export function xend(rect: Rectangular): number {
    return rect.x + rect.width;
}

export function xcenter(rect: Rectangular): number {
    return rect.x + rect.width / 2;
}

export function yend(rect: Rectangular): number {
    return rect.y + rect.height;
}

export function ycenter(rect: Rectangular): number {
    return rect.y + rect.height / 2;
}

export function center(rect: Rectangular): [number, number] {
    return [xcenter(rect), ycenter(rect)];
}

export function north(rect: Rectangular): [number, number] {
    return [xcenter(rect), rect.y];
}

export function east(rect: Rectangular): [number, number] {
    return [xend(rect), ycenter(rect)];
}

export function south(rect: Rectangular): [number, number] {
    return [xcenter(rect), yend(rect)];
}

export function west(rect: Rectangular): [number, number] {
    return [rect.x, ycenter(rect)];
}

export function distance([ax, ay]: [number, number], [bx, by]: [number, number]): number {
    return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2))
}

export function directional_distance(a: Rectangular, b: Rectangular, fn_a: (rect: Rectangular) => [number, number], fn_b: (rect: Rectangular) => [number, number]) {
    return distance(fn_a(a), fn_b(b));
}

export function window_distance(win_a: Meta.Window, win_b: Meta.Window) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), center, center);
}

export function upward_distance(win_a: Meta.Window, win_b: Meta.Window) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), south, north);
}

export function rightward_distance(win_a: Meta.Window, win_b: Meta.Window) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), west, east);
}

export function downward_distance(win_a: Meta.Window, win_b: Meta.Window) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), north, south);
}

export function leftward_distance(win_a: Meta.Window, win_b: Meta.Window) {
    return directional_distance(win_a.get_frame_rect(), win_b.get_frame_rect(), east, west);
}

export function nearest_side(ext: Ext, origin: [number, number], rect: Rectangular): [number, Side] {
    const left = west(rect), top = north(rect), right = east(rect), bottom = south(rect), ctr = center(rect)

    const left_distance = distance(origin, left),
        top_distance = distance(origin, top),
        right_distance = distance(origin, right),
        bottom_distance = distance(origin, bottom),
        center_distance = distance(origin, ctr)

    let nearest: [number, Side] = left_distance < right_distance
        ? [left_distance, Side.LEFT]
        : [right_distance, Side.RIGHT]

    if (top_distance < nearest[0]) nearest = [top_distance, Side.TOP]
    if (bottom_distance < nearest[0]) nearest = [bottom_distance, Side.BOTTOM]
    if (ext.settings.stacking_with_mouse() && center_distance < nearest[0]) nearest = [center_distance, Side.CENTER];

    return nearest
}

export function shortest_side(origin: [number, number], rect: Rectangular): number {
    let shortest = distance(origin, west(rect))
    shortest = Math.min(shortest, distance(origin, north(rect)))
    shortest = Math.min(shortest, distance(origin, east(rect)))
    return Math.min(shortest, distance(origin, south(rect)))
}