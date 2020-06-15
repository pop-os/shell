declare const global: any,
    imports: any,
    _: (arg: string) => string;

interface Rectangular {
    x: number;
    y: number;
    width: number;
    height: number;
}

declare type ProcessResult = [boolean, any, any, number];
declare type SignalID = number;

declare interface GLib {
    PRIORITY_DEFAULT: number;
    PRIORITY_LOW: number;

    find_program_in_path(prog: string): string | null;

    idle_add(priority: any, callback: () => boolean): number;

    signal_handler_block(object: GObject.Object, signal: SignalID): void;
    signal_handler_unblock(object: GObject.Object, signal: SignalID): void;

    source_remove(id: SignalID): void;
    spawn_command_line_sync(cmd: string): ProcessResult;

    timeout_add(priority: number, ms: number, callback: () => Boolean): number;
}

declare namespace GObject {
    interface Object {
        connect(signal: string, callback: (...args: any) => boolean | void): SignalID;
        disconnect(id: SignalID): void;

        ref(): this;
    }
}

declare module Gtk {
    export enum Orientation {
        HORIZONTAL,
        VERTICAL,
    }

    export class Box extends Container {
        constructor(orientation: Orientation, spacing: number);
    }

    export class Container extends Widget {
        constructor();
        add(widget: Widget): void;
        set_border_width(border_width: number): void;
    }

    export class Widget {
        constructor();

        show_all(): void;
    }
}

declare namespace Clutter {
    enum ActorAlign {
        FILL = 0,
        START = 1,
        CENTER = 3,
        END = 3
    }

    interface Actor extends Rectangular, GObject.Object {
        visible: boolean;
        x_align: ActorAlign;
        y_align: ActorAlign;

        add_child(child: Actor): void;
        destroy(): void;
        destroy_all_children(): void;
        ease(params: Object): void;
        hide(): void;
        get_child_at_index(nth: number): Clutter.Actor | null;
        get_n_children(): number;
        get_parent(): Clutter.Actor | null;
        get_transition(param: string): any | null;
        is_visible(): boolean;
        queue_redraw(): void;
        remove_all_children(): void;
        remove_all_transitions(): void;
        remove_child(child: Actor): void;
        set_child_above_sibling(child: Actor, sibling: Actor | null): void;
        set_child_below_sibling(child: Actor, sibling: Actor | null): void;
        set_easing_duration(msecs: number | null): void;
        set_opacity(value: number): void;
        set_size(width: number, height: number): void;
        set_y_align(align: ActorAlign): void;
        show(): void;
    }

    interface ActorBox {
        new(x: number, y: number, width: number, height: number): ActorBox;
    }

    interface Text extends Actor {
        get_text(): Readonly<string>;
        set_text(text: string | null): void;
    }
}

declare namespace Meta {
    enum DisplayDirection {
        UP,
        DOWN,
        LEFT,
        RIGHT,
    }

    enum MaximizeFlags {
        HORIZONTAL,
        VERTICAL,
        BOTH
    }

    interface Window extends Clutter.Actor {
        minimized: Readonly<boolean>;
        window_type: Readonly<any>;

        activate(time: number): void;
        change_workspace_by_index(workspace: number, append: boolean): void;
        delete(timestamp: number): void;
        get_buffer_rect(): Rectangular;
        get_compositor_private(): Clutter.Actor | null;
        get_description(): string;
        get_frame_rect(): Rectangular;
        get_maximized(): number;
        get_monitor(): number;
        get_pid(): number;
        get_stable_sequence(): number;
        get_title(): string;
        get_transient_for(): Window | null;
        get_wm_class(): string | null;
        get_workspace(): Workspace | null;
        has_focus(): boolean;
        is_client_decorated(): boolean;
        is_fullscreen(): boolean;
        is_skip_taskbar(): boolean;
        make_above(): void;
        make_fullscreen(): void;
        maximize(flags: MaximizeFlags): void;
        move_resize_frame(user_op: boolean, x: number, y: number, w: number, h: number): boolean;
        raise(): void;
        unmake_fullscreen(): void;
        unmaximize(flags: any): void;
        unminimize(): void;
    }

    interface Workspace {
        activate(time: number): boolean;
        index(): number;
    }
}

declare namespace Shell {
    interface Dialog extends St.Widget {
        _dialog: St.Widget;
        contentLayout: St.Widget;
    }

    interface ModalDialog extends St.Widget {
        contentLayout: St.Widget;
        dialogLayout: Dialog;

        close(timestamp: number): void;
        open(timestamp: number, on_primary: boolean): void;

        setInitialKeyFocus(actor: Clutter.Actor): void;
    }
}

declare namespace St {
    interface Button extends Widget {
        set_label(label: string): void;
    }

    interface Widget extends Clutter.Actor {
        add(child: St.Widget): void;
        hide(): void;
        set_style_class_name(name: string): void;
        add_style_class_name(name: string): void
        remove_style_class_name(name: string) : void;

        set_style_pseudo_class(name: string): void;
        add_style_pseudo_class(name: string): void;
        remove_style_pseudo_class(name: string): void

        show(): void;
        show_all(): void;
    }

    interface Entry extends Widget {
        clutter_text: any;

        get_clutter_text(): Clutter.Text;
        grab_key_focus(): void;
    }
}
