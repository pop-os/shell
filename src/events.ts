// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Window from 'window';

/** Type representing all possible events handled by the extension's system. */
export type ExtEvent = CallbackEvent | WindowUnion | WindowCreate;

/** Eevnt with generic callback */
export interface CallbackEvent {
    tag: 1;
    callback: () => void;
}

/** Event that handles a registered window */
export interface WindowUnion {
    tag: 2;
    window: Window.ShellWindow;
    event: WindowEvent;
}

/** Event that registers a new window */
export interface WindowCreate {
    tag: 3;
    window: Meta.Window;
}

/** The type of event triggered on a window */
export enum WindowEvent {
    Size,
    Workspace,
    Minimize,
    Maximize
}

/** Utility function for creating the an ExtEvent */
export function window(window: Window.ShellWindow, event: WindowEvent): WindowUnion {
    return { tag: 2, window, event }
}
