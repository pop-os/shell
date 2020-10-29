declare const global: Global,
    imports: any,
    log: any,
    _: (arg: string) => string;

interface Global {
    get_current_time(): number;
    get_pointer(): [number, number];
    get_window_actors(): Array<Meta.WindowActor>;
    get_work_area_for_monitor(i: number): null | Rectangular;
    log(msg: string): void;

    display: Meta.Display;
    run_at_leisure(func: () => void): void;
    session_mode: string;
    stage: Clutter.Actor;
    window_group: Clutter.Actor;
    window_manager: Meta.WindowManager;
    workspace_manager: Meta.WorkspaceManager;
}

interface Rectangular {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface DialogButtonAction {
    label: string;
    action: () => void;
    key?: number;
    default?: boolean;
}

declare type ProcessResult = [boolean, any, any, number];
declare type SignalID = number;

declare interface GLib {
    PRIORITY_DEFAULT: number;
    PRIORITY_LOW: number;

    find_program_in_path(prog: string): string | null;
    get_current_dir(): string;

    idle_add(priority: any, callback: () => boolean): number;

    signal_handler_block(object: GObject.Object, signal: SignalID): void;
    signal_handler_unblock(object: GObject.Object, signal: SignalID): void;

    source_remove(id: SignalID): void;
    spawn_command_line_sync(cmd: string): ProcessResult;
    spawn_command_line_async(cmd: string): boolean;

    timeout_add(priority: number, ms: number, callback: () => Boolean): number;
}

declare namespace GObject {
    interface Object {
        connect(signal: string, callback: (...args: any) => boolean | void): SignalID;
        disconnect(id: SignalID): void;

        ref(): this;
    }
}

declare namespace Gtk {
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

    enum AnimationMode {
        EASE_IN_QUAD = 2,
        EASE_OUT_QUAD = 3,
    }

    interface Actor extends Rectangular, GObject.Object {
        visible: boolean;
        x_align: ActorAlign;
        y_align: ActorAlign;
        opacity: number;

        add(child: Actor): void;
        add_child(child: Actor): void;
        destroy(): void;
        destroy_all_children(): void;
        ease(params: Object): void;
        hide(): void;
        get_child_at_index(nth: number): Clutter.Actor | null;
        get_n_children(): number;
        get_parent(): Clutter.Actor | null;
        get_stage(): Clutter.Actor | null;
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
        set_position(x: number, y: number): void;
        set_size(width: number, height: number): void;
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

    enum MotionDirection {
        UP,
        DOWN,
        LEFT,
        RIGHT
    }

    interface Display extends GObject.Object {
        get_current_monitor(): number;
        get_focus_window(): null | Meta.Window;
        get_monitor_index_for_rect(rect: Rectangular): number;
        get_monitor_geometry(monitor: number): null | Rectangular;
        get_monitor_neighbor_index(monitor: number, direction: DisplayDirection): number;
        get_n_monitors(): number;
        get_primary_monitor(): number;
        get_tab_list(list: number, workspace: Meta.Workspace | null): Array<Meta.Window>;
        get_workspace_manager(): WorkspaceManager;
    }

    interface Window extends Clutter.Actor {
        appears_focused: Readonly<boolean>;
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
        get_work_area_for_monitor(monitor: number): null | Rectangular;
        get_workspace(): Workspace;
        has_focus(): boolean;
        is_above(): boolean;
        is_client_decorated(): boolean;
        is_fullscreen(): boolean;
        is_on_all_workspaces(): boolean;
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

    interface WindowActor extends Clutter.Actor {
        get_meta_window(): Meta.Window;
    }

    interface WindowManager extends GObject.Object {

    }

    interface Workspace extends GObject.Object {
        n_windows: number;

        activate(time: number): boolean;
        activate_with_focus(window: Meta.Window, timestamp: number): void;
        get_neighbor(direction: Meta.MotionDirection): null | Workspace;
        get_work_area_for_monitor(monitor: number): null | Rectangular;
        index(): number;
    }

    interface WorkspaceManager extends GObject.Object {
        append_new_workspace(activate: boolean, timestamp: number): Workspace;
        get_active_workspace(): Workspace;
        get_active_workspace_index(): number;
        get_n_workspaces(): number;
        get_workspace_by_index(index: number): null | Workspace;
        remove_workspace(workspace: Workspace, timestamp: number): void;
        reorder_workspace(workspace: Workspace, new_index: number): void;
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

        addButton(action: DialogButtonAction): void;

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
        add_style_class_name(name: string): void
        add_style_pseudo_class(name: string): void;
        add(child: St.Widget): void;
        get_theme_node(): any
        hide(): void;
        remove_style_class_name(name: string): void;
        remove_style_pseudo_class(name: string): void
        set_style(inlinecss: string): boolean;
        set_style_class_name(name: string): void;
        set_style_pseudo_class(name: string): void;
        show_all(): void;
        show(): void;
    }

    interface Bin extends St.Widget {
        // empty for now
    }

    interface Entry extends Widget {
        clutter_text: any;

        get_clutter_text(): Clutter.Text;
        grab_key_focus(): void;
    }
}
