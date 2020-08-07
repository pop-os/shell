export { }

// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gtk } = imports.gi;

const { Settings } = imports.gi.Gio;

import * as settings from 'settings';

interface AppWidgets {
    window_titles: any,
    snap_to_grid: any,
    outer_gap: any,
    inner_gap: any,
    override_wm_hints: any
}

// @ts-ignore
function init() { }

function settings_dialog_new(): Gtk.Container {
    let [widgets, grid] = settings_dialog_view();

    let ext = new settings.ExtensionSettings();

    widgets.window_titles.set_active(ext.show_title());
    widgets.window_titles.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_show_title(state);
        Settings.sync();
    });

    widgets.snap_to_grid.set_active(ext.snap_to_grid());
    widgets.snap_to_grid.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_snap_to_grid(state);
        Settings.sync();
    });

    widgets.outer_gap.set_text(String(ext.gap_outer()));
    widgets.outer_gap.connect('activate', (widget: any) => {
        let parsed = parseInt((widget.get_text() as string).trim());
        if (!isNaN(parsed)) {
            ext.set_gap_outer(parsed);
            Settings.sync();
        };
    });

    widgets.inner_gap.set_text(String(ext.gap_inner()));
    widgets.inner_gap.connect('activate', (widget: any) => {
        let parsed = parseInt((widget.get_text() as string).trim());
        if (!isNaN(parsed)) {
            ext.set_gap_inner(parsed);
            Settings.sync();
        }
    });

    widgets.override_wm_hints.set_active(ext.override_wm_hints());
    widgets.override_wm_hints.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_override_wm_hints(state);
        // TODO: prefs.js does not seem to see the Extension instance, commenting for now
        // if (state === false) {
        //     // it will try to restore all window hints
        //     Me.restore_all_window_hints();
        // }
        // if (Me.settings.tile_by_default()) {
        //     // flip two times to enable the hint
        //     Me.toggle_tiling();
        //     Me.toggle_tiling();
        // } else {
        //     Me.toggle_tiling();
        // }
        Settings.sync();
    });

    return grid;
}

function settings_dialog_view(): [AppWidgets, Gtk.Container] {
    let grid = new Gtk.Grid({
        column_spacing: 12,
        row_spacing: 12,
        border_width: 12
    });

    let win_label = new Gtk.Label({
        label: "Show Window Titles",
        xalign: 0.0,
        hexpand: true
    });
    let window_titles = new Gtk.Switch({ halign: Gtk.Align.START });

    let snap_label = new Gtk.Label({
        label: "Snap to Grid (Floating Mode)",
        xalign: 0.0
    });

    let snap_to_grid = new Gtk.Switch({ halign: Gtk.Align.START });

    let override_wm_hints_label = new Gtk.Label({
        label: "Override WM Hints - Applications can crash. Restart Popshell to take effect.",
        xalign: 0.0
    });

    let override_wm_hints = new Gtk.Switch({ halign: Gtk.Align.START });

    grid.attach(win_label, 0, 0, 1, 1);
    grid.attach(window_titles, 1, 0, 1, 1);

    grid.attach(snap_label, 0, 1, 1, 1);
    grid.attach(snap_to_grid, 1, 1, 1, 1);

    grid.attach(override_wm_hints_label, 0, 2, 1, 1)
    grid.attach(override_wm_hints, 1, 2, 1, 1)

    let [inner_gap, outer_gap] = gaps_section(grid, 3);

    let widgets = { inner_gap, outer_gap, snap_to_grid, window_titles, override_wm_hints };

    return [widgets, grid];
}

function gaps_section(grid: any, top: number): [any, any] {
    let outer_label = new Gtk.Label({
        label: "Outer",
        xalign: 0.0,
        margin_start: 24
    });

    let outer_entry = number_entry();

    let inner_label = new Gtk.Label({
        label: "Inner",
        xalign: 0.0,
        margin_start: 24
    });

    let inner_entry = number_entry();

    let section_label = new Gtk.Label({
        label: "Gaps",
        xalign: 0.0
    });

    grid.attach(section_label, 0, top, 1, 1);
    grid.attach(outer_label, 0, top + 1, 1, 1);
    grid.attach(outer_entry, 1, top + 1, 1, 1);
    grid.attach(inner_label, 0, top + 2, 1, 1);
    grid.attach(inner_entry, 1, top + 2, 1, 1);

    return [inner_entry, outer_entry];
}

function number_entry(): Gtk.Widget {
    return new Gtk.Entry({ input_purpose: Gtk.InputPurpose.NUMBER });
}

// @ts-ignore
function buildPrefsWidget() {
    let dialog = settings_dialog_new();
    dialog.show_all();
    return dialog;
}
