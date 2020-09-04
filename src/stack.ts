// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { Ext } from './extension';
import type { ShellWindow } from './window';

import * as Ecs from 'ecs';
import * as a from 'arena';

const Arena = a.Arena;
const { St } = imports.gi;

const ACTIVE_TAB = 'pop-shell-tab pop-shell-tab-active';
const INACTIVE_TAB = 'pop-shell-tab pop-shell-tab-inactive';
const URGENT_TAB = 'pop-shell-tab pop-shell-tab-urgent';

export var TAB_HEIGHT: number = 24

interface Tab {
    entity: Entity;
    button: number;
    button_signal: SignalID | null;
    signals: Array<SignalID>;
}

interface StackWidgets {
    tabs: St.Widget;
}

function stack_widgets_new(): StackWidgets {
    let tabs = new St.BoxLayout({
        style_class: 'pop-shell-stack',
        x_expand: true
    });

    tabs.get_layout_manager()?.set_homogeneous(true);

    return { tabs };
}

export class Stack {
    ext: Ext;

    widgets: null | StackWidgets = null;

    active: Entity;

    active_id: number = 0

    tabs: Array<Tab> = new Array();

    workspace: number;

    buttons: a.Arena<St.Button> = new Arena();

    stack_rect: Rectangular = { width: 0, height: 0, x: 0, y: 0 };

    private border: St.Bin = new St.Bin({ style_class: 'pop-shell-active-hint' });

    private border_signal: SignalID;

    private border_size: number = 0;

    private active_signals: [SignalID, SignalID] | null = null;

    private rect: Rectangular = { width: 0, height: 0, x: 0, y: 0 };

    private restacker: SignalID = (global.display as GObject.Object).connect('restacked', () => this.restack());

    private tabs_destroy: SignalID;

    constructor(ext: Ext, active: Entity, workspace: number) {
        this.ext = ext;
        this.active = active;
        this.workspace = workspace;

        this.widgets = stack_widgets_new();

        global.window_group.add_child(this.widgets.tabs);
        global.window_group.add_child(this.border);

        this.reposition();

        this.border_signal = this.border.connect('style-changed', () => {
            this.on_style_changed();
        });

        this.border.hide();

        this.tabs_destroy = this.widgets.tabs.connect('destroy', () => this.recreate_widgets());
    }

    /** Adds a new window to the stack */
    add(window: ShellWindow) {
        if (!this.widgets) return;

        if (this.border_size === 0 && window.meta.get_compositor_private()?.get_stage()) {
            this.on_style_changed();
        }

        const entity = window.entity;
        const label = window.meta.get_title();

        const button: St.Button = new St.Button({
            label,
            x_expand: true,
            style_class: Ecs.entity_eq(entity, this.active) ? ACTIVE_TAB : INACTIVE_TAB
        });

        const id = this.buttons.insert(button);
        this.tabs.push({ entity, signals: [], button: id, button_signal: null });

        this.watch_signals(this.tabs.length - 1, id, window);

        this.widgets.tabs.add(button);
    }

    /** Activates a tab based on the previously active entry */
    auto_activate(): null | Entity {
        if (this.tabs.length === 0) return null;

        let id = this.tabs.length <= this.active_id ? this.tabs.length - 1 : this.active_id;

        const c = this.tabs[id];

        this.activate(c.entity);
        return c.entity;
    }

    /** Activates the tab of this entity */
    activate(entity: Entity) {
        // Don't activate if we've already activated this window
        if (Ecs.entity_eq(entity, this.active)) {
            this.restack();
            return;
        }

        const win = this.ext.windows.get(entity);
        if (!win) return;

        this.active_connect(win.meta, entity);

        let id = 0;

        for (const component of this.tabs) {
            let name;

            this.window_exec(id, component.entity, (window) => {
                const actor = window.meta.get_compositor_private();

                if (Ecs.entity_eq(entity, component.entity)) {
                    this.active_id = id;
                    name = ACTIVE_TAB;
                    if (actor) actor.show()
                } else {
                    name = INACTIVE_TAB;
                    if (actor) actor.hide();
                }

                this.buttons.get(component.button)?.set_style_class_name(name);
            })

            id += 1;
        }

        this.restack();
    }

    /** Connects `on_window_changed` callbacks to the newly-active window */
    private active_connect(window: Meta.Window, active: Entity) {
        // Disconnect before attaching new window as active window
        this.active_disconnect();

        // Memorize them for future calls
        this.active = active;

        this.active_reconnect(window);
    }

    private active_reconnect(window: Meta.Window) {
        // Attach this callback on both signals of the window
        const on_window_changed = () => this.on_grab(() => {
            const window = this.ext.windows.get(this.active);
            if (window) {
                this.update_positions(window.meta.get_frame_rect());
                this.window_changed()
            } else {
                this.active_disconnect();
            }
        });

        this.active_signals = [
            window.connect('size-changed', on_window_changed),
            window.connect('position-changed', on_window_changed)
        ]
    }

    /** Disconnects signals from the active window in the stack */
    private active_disconnect() {
        const active_meta = this.active_meta();

        if (this.active_signals && active_meta) {
            for (const s of this.active_signals) active_meta.disconnect(s)
        }

        this.active_signals = null;
    }

    private active_meta(): Meta.Window | undefined {
        return this.ext.windows.get(this.active)?.meta;
    }

    /** Clears watched tabs and removes all tabs */
    clear() {
        this.active_disconnect();
        for (const c of this.tabs.splice(0)) this.tab_disconnect(c);
        this.widgets?.tabs.destroy_all_children();
        this.buttons.truncate(0);
    }

    /** Disconnects a tab from the stack */
    tab_disconnect(c: Tab) {
        const window = this.ext.windows.get(c.entity);
        if (window) {
            for (const s of c.signals) window.meta.disconnect(s);
            window.meta.get_compositor_private()?.show();
        }

        c.signals = [];

        if (c.button_signal) {
            const b = this.buttons.get(c.button);
            if (b) {
                b.disconnect(c.button_signal);
                c.button_signal = null;
            }
        }
    }

    /** Deactivate the signals belonging to an entity */
    deactivate(w: ShellWindow) {
        for (const c of this.tabs) if (Ecs.entity_eq(c.entity, w.entity)) {
            this.tab_disconnect(c);
        }

        if (this.active_signals && Ecs.entity_eq(this.active, w.entity)) {
            this.active_disconnect();
        }
    }

    /** Disconnects this stack's signal, and destroys its widgets */
    destroy() {
        global.display.disconnect(this.restacker);
        this.border.disconnect(this.border_signal);
        this.border.destroy();
        this.active_disconnect();

        // Disconnect stack signals from each window, and unhide them.
        for (const c of this.tabs) {
            this.tab_disconnect(c);
            this.ext.windows.get(c.entity)?.meta.get_compositor_private()?.show();
        }

        for (const b of this.buttons.values()) b.destroy();

        if (this.widgets) {
            const tabs = this.widgets.tabs;
            this.widgets = null;
            tabs.destroy();
        }
    }

    hide_border() {
        this.border.hide();
    }

    private on_grab(or: () => void) {
        if (this.ext.grab_op !== null) {
            if (Ecs.entity_eq(this.ext.grab_op.entity, this.active)) {
                if (this.widgets) {
                    const parent = this.widgets.tabs.get_parent();
                    const actor = this.active_meta()?.get_compositor_private();
                    if (actor && parent) {
                        parent.set_child_below_sibling(this.widgets.tabs, actor);
                    }
                }

                return;
            }
        }

        or();
    }

    private on_style_changed() {
        this.border_size = this.border.get_theme_node().get_border_width(St.Side.TOP);
    }

    /** Workaround for when GNOME Shell destroys our widgets when they're reparented
     *  in an active workspace change. */
    recreate_widgets() {
        if (this.widgets !== null) {
            this.widgets.tabs.disconnect(this.tabs_destroy)
            this.widgets = stack_widgets_new();

            global.window_group.add_child(this.widgets.tabs);

            this.tabs_destroy = this.widgets.tabs.connect('destroy', () => this.recreate_widgets());

            this.active_disconnect();

            for (const c of this.tabs.splice(0)) {
                this.tab_disconnect(c)
                const window = this.ext.windows.get(c.entity);
                if (window) this.add(window);
            }

            this.update_positions(this.rect);
            this.restack();

            const window = this.ext.windows.get(this.active);
            if (!window) return;

            this.active_reconnect(window.meta)
        }
    }

    remove_by_pos(idx: number) {
        const c = this.tabs[idx];
        if (c) this.remove_tab_component(c, idx)
    }

    remove_tab_component(c: Tab, idx: number) {
        if (!this.widgets) return;

        this.tab_disconnect(c);

        const b = this.buttons.get(c.button);
        if (b) {
            this.widgets.tabs.remove_child(b);
            b.destroy();
            this.buttons.remove(c.button)
        }

        this.tabs.splice(idx, 1);
    }

    /** Removes the tab associated with the entity */
    remove_tab(entity: Entity): null | number {
        if (!this.widgets) return null;

        let idx = 0;
        for (const c of this.tabs) {
            if (Ecs.entity_eq(c.entity, entity)) {
                this.remove_tab_component(c, idx)
                return idx;
            }
            idx += 1;
        }

        return null;
    }

    replace(window: ShellWindow) {
        if (!this.widgets) return;
        const c = this.tabs[this.active_id], actor = window.meta.get_compositor_private();
        if (c && actor) {
            this.tab_disconnect(c)

            if (Ecs.entity_eq(window.entity, this.active)) {
                this.active_connect(window.meta, window.entity);
                actor.show();
            } else {
                actor.hide();
            }

            this.watch_signals(this.active_id, c.button, window);
            this.buttons.get(c.button)?.set_label(window.meta.get_title());
            this.activate(window.entity);
        }
    }

    /** Repositions the stack, arranging the stack's actors around the active window */
    reposition() {
        if (!this.widgets) return;

        const window = this.ext.windows.get(this.active);
        if (!window) return;

        const actor = window.meta.get_compositor_private();
        if (!actor) {
            this.active_disconnect();
            return;
        }

        actor.show();

        const parent = actor.get_parent();

        if (!parent) {
            return;
        }

        let restack = false;
        const stack_parent = this.widgets.tabs.get_parent();
        if (!stack_parent) {
            parent.add_child(this.widgets.tabs);
            restack = true;
        } else if (stack_parent != parent) {
            stack_parent.remove_child(this.widgets.tabs);
            restack = true;
        }

        if (restack) {
            parent.add_child(this.widgets.tabs);
            for (const c of this.tabs) {
                if (Ecs.entity_eq(c.entity, this.active)) continue;
                const actor = this.ext.windows.get(c.entity)?.meta.get_compositor_private();
                if (!actor) continue
                actor.hide();
            }
        }

        // Reposition actors on the screen, being careful about not displaying over maximized windows
        if (!window.meta.is_fullscreen() && !window.is_maximized() && !this.ext.maximized_on_active_display()) {
            parent.set_child_above_sibling(this.widgets.tabs, actor);
            parent.set_child_above_sibling(this.border, this.widgets.tabs);
        } else {
            parent.set_child_below_sibling(this.widgets.tabs, actor);
        }
    }

    /** Repositions the stack, and hides all but the active window in the stack */
    restack() {
        this.on_grab(() => {
            if (!this.widgets) return;
            let idx = 0;

            // Hide all actors on incompatible workspace / show them when marked to reveal
            if (global.workspace_manager.get_active_workspace_index() !== this.workspace) {
                this.widgets.tabs.visible = false;
                for (const c of this.tabs) {
                    this.actor_exec(idx, c.entity, (actor) => actor.hide());
                    idx += 1;
                }
                this.hide_border();
            } else if (this.widgets.tabs.visible) {
                for (const c of this.tabs) {
                    this.actor_exec(idx, c.entity, (actor) => actor.hide());
                    idx += 1;
                }

                this.reposition();
            }

            this.update_border_layout();
        })
    }

    show_border() {
        if (this.ext.settings.active_hint()) {
            const window = this.ext.windows.get(this.active);
            if (window && !window.is_maximized() && !window.meta.is_fullscreen()) {
                this.border.show();
                this.restack();
            }
        }
    }

    /** Changes visibility of the stack's actors */
    set_visible(visible: boolean) {
        if (!this.widgets) return;

        if (visible) {
            this.widgets.tabs.show();
            this.widgets.tabs.visible = true;
        } else {
            this.widgets.tabs.visible = false;
            this.widgets.tabs.hide();
        }
    }

    private update_border_layout() {
        const meta = this.active_meta();
        if (!meta) return;

        const rect = meta.get_frame_rect(),
            size = this.border_size,
            border = this.border;

        border.set_position(rect.x - size, rect.y - TAB_HEIGHT - size);
        border.set_size(rect.width + 2 * size, rect.height + TAB_HEIGHT + 2 * size);
    }

    /** Updates the dimensions and positions of the stack's actors */
    update_positions(rect: Rectangular) {
        if (!this.widgets) return;

        this.rect = rect;

        const tabs_height = TAB_HEIGHT * this.ext.dpi;

        this.stack_rect = {
            x: rect.x,
            y: rect.y - tabs_height,
            width: rect.width,
            height: tabs_height + rect.height,
        };

        this.widgets.tabs.x = rect.x;
        this.widgets.tabs.y = this.stack_rect.y;
        this.widgets.tabs.height = tabs_height;
        this.widgets.tabs.width = rect.width;
    }

    private watch_signals(comp: number, button: number, window: ShellWindow) {
        const entity = window.entity;
        const widget = this.buttons.get(button);
        if (!widget) return;

        const c = this.tabs[comp];

        // Detach button signal if it's still attached
        if (c.button_signal) widget.disconnect(c.button_signal);

        // Connect tab-clicked signal
        c.button_signal = widget.connect('clicked', () => {
            this.activate(entity);
            this.window_exec(comp, entity, (window) => {
                const actor = window.meta.get_compositor_private();
                if (actor) {
                    actor.show();
                    window.meta.raise();
                    window.meta.unminimize();
                    window.meta.activate(global.get_current_time());

                    this.reposition();

                    for (const comp of this.tabs) {
                        this.buttons.get(comp.button)?.set_style_class_name(INACTIVE_TAB);
                    }

                    widget.set_style_class_name(ACTIVE_TAB);
                }
            })
        });

        // Detach signals if they're still attached
        if (this.tabs[comp].signals) {
            for (const c of this.tabs[comp].signals) window.meta.disconnect(c);
        }

        // Attach new signals
        this.tabs[comp].signals = [
            window.meta.connect('notify::title', () => {
                this.window_exec(comp, entity, (window) => {
                    this.buttons.get(button)?.set_label(window.meta.get_title())
                });
            }),

            window.meta.connect('notify::urgent', () => {
                this.window_exec(comp, entity, (window) => {
                    if (!window.meta.has_focus()) {
                        this.buttons.get(button)?.set_style_class_name(URGENT_TAB);
                    }
                })
            })
        ];
    }

    private window_changed() {
        this.ext.show_border_on_focused();
    }

    private actor_exec(comp: number, entity: Entity, func: (window: Clutter.Actor) => void) {
        this.window_exec(comp, entity, (window) => {
            func(window.meta.get_compositor_private() as Clutter.Actor)
        })
    }

    private window_exec(comp: number, entity: Entity, func: (window: ShellWindow) => void) {
        const window = this.ext.windows.get(entity);
        if (window && window.actor_exists()) {
            func(window)
        } else {
            this.tab_disconnect(this.tabs[comp])
        }
    }
}
