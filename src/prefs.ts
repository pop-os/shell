export { }

const ExtensionUtils = imports.misc.extensionUtils;
// @ts-ignore
const Me = ExtensionUtils.getCurrentExtension();

const { Gtk } = imports.gi;

const { Settings } = imports.gi.Gio;

import * as settings from 'settings';
import * as log from 'log';

interface AppWidgets {
    fullscreen_launcher: any,
    inner_gap: any,
    mouse_cursor_follows_active_window: any,
    outer_gap: any,
    show_skip_taskbar: any,
    smart_gaps: any,
    snap_to_grid: any,
    window_titles: any,
}

// @ts-ignore
function init() { }

function settings_dialog_new(): Gtk.Container {
    let [app, grid] = settings_dialog_view();

    let ext = new settings.ExtensionSettings();

    app.window_titles.set_active(ext.show_title());
    app.window_titles.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_show_title(state);
        Settings.sync();
    });

    app.snap_to_grid.set_active(ext.snap_to_grid());
    app.snap_to_grid.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_snap_to_grid(state);
        Settings.sync();
    });

    app.smart_gaps.set_active(ext.smart_gaps());
    app.smart_gaps.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_smart_gaps(state);
        Settings.sync();
    })

    app.outer_gap.set_text(String(ext.gap_outer()));
    app.outer_gap.connect('activate', (widget: any) => {
        let parsed = parseInt((widget.get_text() as string).trim());
        if (!isNaN(parsed)) {
            ext.set_gap_outer(parsed);
            Settings.sync();
        };
    });

    app.inner_gap.set_text(String(ext.gap_inner()));
    app.inner_gap.connect('activate', (widget: any) => {
        let parsed = parseInt((widget.get_text() as string).trim());
        if (!isNaN(parsed)) {
            ext.set_gap_inner(parsed);
            Settings.sync();
        }
    });

    app.show_skip_taskbar.set_active(ext.show_skiptaskbar());
    app.show_skip_taskbar.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_show_skiptaskbar(state);
        Settings.sync();
    });

    app.mouse_cursor_follows_active_window.set_active(ext.mouse_cursor_follows_active_window());
    app.mouse_cursor_follows_active_window.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_mouse_cursor_follows_active_window(state);
        Settings.sync();
    });

    app.fullscreen_launcher.set_active(ext.fullscreen_launcher())
    app.fullscreen_launcher.connect('state-set', (_widget: any, state: boolean) => {
        ext.set_fullscreen_launcher(state)
        Settings.sync()
    })

    return grid;
}

function settings_dialog_view(): [AppWidgets, Gtk.Container] {
    const grid = new Gtk.Grid({
        column_spacing: 12,
        row_spacing: 12,
        margin_start: 10,
        margin_end: 10,
        margin_bottom: 10,
        margin_top: 10,
    })

    const win_label = new Gtk.Label({
        label: "Show Window Titles",
        xalign: 0.0,
        hexpand: true
    })

    const snap_label = new Gtk.Label({
        label: "Snap to Grid (Floating Mode)",
        xalign: 0.0
    })

    const smart_label = new Gtk.Label({
        label: "Smart Gaps",
        xalign: 0.0
    })

    const show_skip_taskbar_label = new Gtk.Label({
        label: "Show Minimize to Tray Windows",
        xalign: 0.0
    })

    const mouse_cursor_follows_active_window_label = new Gtk.Label({
        label: "Mouse Cursor Follows Active Window",
        xalign: 0.0
    })

    const fullscreen_launcher_label = new Gtk.Label({
        label: "Allow launcher over fullscreen window",
        xalign: 0.0
    })

    const [inner_gap, outer_gap] = gaps_section(grid, 7);

    const settings = {
        inner_gap,
        outer_gap,
        fullscreen_launcher: new Gtk.Switch({ halign: Gtk.Align.END }),
        smart_gaps: new Gtk.Switch({ halign: Gtk.Align.END }),
        snap_to_grid: new Gtk.Switch({ halign: Gtk.Align.END }),
        window_titles: new Gtk.Switch({ halign: Gtk.Align.END }),
        show_skip_taskbar: new Gtk.Switch({ halign: Gtk.Align.END }),
        mouse_cursor_follows_active_window: new Gtk.Switch({ halign: Gtk.Align.END })
    }

    grid.attach(win_label, 0, 0, 1, 1)
    grid.attach(settings.window_titles, 1, 0, 1, 1)

    grid.attach(snap_label, 0, 1, 1, 1)
    grid.attach(settings.snap_to_grid, 1, 1, 1, 1)

    grid.attach(smart_label, 0, 2, 1, 1)
    grid.attach(settings.smart_gaps, 1, 2, 1, 1)

    grid.attach(fullscreen_launcher_label, 0, 3, 1, 1)
    grid.attach(settings.fullscreen_launcher, 1, 3, 1, 1)

    grid.attach(show_skip_taskbar_label, 0, 4, 1, 1)
    grid.attach(settings.show_skip_taskbar, 1, 4, 1, 1)

    grid.attach(mouse_cursor_follows_active_window_label, 0, 5, 1, 1)
    grid.attach(settings.mouse_cursor_follows_active_window, 1, 5, 1, 1)

    logging_combo(grid, 6)

    return [settings, grid]
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

function logging_combo(grid: any, top_index: number) {
    let log_label = new Gtk.Label({
        label: `Log Level`,
        halign: Gtk.Align.START
    });

    grid.attach(log_label, 0, top_index, 1, 1);

    let log_combo = new Gtk.ComboBoxText();

    for (const key in log.LOG_LEVELS) {
        // since log level loop will contain key and level,
        // then cherry-pick the number, key will be the text value
        if (typeof log.LOG_LEVELS[key] === 'number') {
            log_combo.append(`${log.LOG_LEVELS[key]}`, key);
        }
    }

    let current_log_level = log.log_level();

    log_combo.set_active_id(`${current_log_level}`);
    log_combo.connect("changed", () => {
        let activeId = log_combo.get_active_id();

        let settings = ExtensionUtils.getSettings();
        settings.set_uint('log-level', activeId);
    });

    grid.attach(log_combo, 1, top_index, 1, 1);
}

// @ts-ignore
function buildPrefsWidget() {
    let dialog = settings_dialog_new();
    if (dialog.show_all) {
        dialog.show_all()
    } else {
        dialog.show();
    }
    return dialog;
}
