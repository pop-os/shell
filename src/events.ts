// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Window from 'window';

/** Type representing all possible events handled by the extension's system. */
export type ExtEvent = GenericCallback
    | ManagedWindow
    | CreateWindow
    | GlobalEventTag;

/** Eevnt with generic callback */
export interface GenericCallback {
    tag: 1;
    callback: () => void;
    name?: string;
}

/** Event that handles a registered window */
export interface ManagedWindow {
    tag: 2;
    window: Window.ShellWindow;
    kind: Movement | Basic;
}

/** Event that registers a new window */
export interface CreateWindow {
    tag: 3;
    window: Meta.Window;
}

export interface GlobalEventTag {
    tag: 4;
    event: GlobalEvent;
}

export enum GlobalEvent {
    GtkShellChanged,
    GtkThemeChanged,
    MonitorsChanged,
    OverviewShown,
    OverviewHidden,
}

export interface Movement {
    tag: 1;
    rect: Rectangular;
}

export interface Basic {
    tag: 2;
    event: WindowEvent
}

/** The type of event triggered on a window */
export enum WindowEvent {
    Size,
    Workspace,
    Minimize,
    Maximize,
    Fullscreen,
}

export function global(event: GlobalEvent): GlobalEventTag {
    return { tag: 4, event };
}

export function window_move(window: Window.ShellWindow, rect: Rectangular): ManagedWindow {
    return { tag: 2, window, kind: { tag: 1, rect } };
}

/** Utility function for creating the an ExtEvent */
export function window_event(window: Window.ShellWindow, event: WindowEvent): ManagedWindow {
    return { tag: 2, window, kind: { tag: 2, event } }
}
