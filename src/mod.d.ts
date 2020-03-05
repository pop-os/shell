declare const global: any,
    imports: any,
    _: (arg: string) => string;

interface Rectangular {
    x: number;
    y: number;
    width: number;
    height: number;
}

declare namespace GObject {
    interface Object {
        connect: (signal: string, callback: (...args: any) => boolean) => number;
        disconnect: (id: number) => void;
    }
}

declare namespace Clutter {
    interface Actor extends Rectangular, GObject.Object {
        visible: boolean;

        add_child: (child: Actor) => void;
        get_child_at_index: (nth: number) => Clutter.Actor | null;
        get_n_children: () => number;
        get_parent: () => Clutter.Actor | null;
        remove_all_children: () => void;
        remove_child: (child: Actor) => void;
        set_child_below_sibling: (child: Actor, sibling: Actor | null) => void;
    }
}

declare namespace Meta {
    interface Window extends Clutter.Actor {
        window_type: any;

        activate: (time: number) => void;
        change_workspace_by_index: (workspace: number, append: boolean) => void;
        get_compositor_private: () => Clutter.Actor;
        get_description: () => string;
        get_frame_rect: () => Rectangular;
        get_maximized: () => boolean;
        get_monitor: () => number;
        get_stable_sequence: () => number;
        get_title: () => string;
        get_wm_class: () => string;
        get_workspace: () => Workspace | null;
        is_client_decorated: () => boolean;
        is_skip_taskbar: () => boolean;
        move_resize_frame: (user_op: boolean, x: number, y: number, w: number, h: number) => boolean;
        raise: () => void;
        unmaximize: (flags: any) => void;
        unminimize: () => void;
    }

    interface Workspace {
        activate: (time: number) => boolean;
        index: () => number;
    }
}
