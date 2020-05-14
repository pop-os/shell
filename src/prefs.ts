export { }

// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gtk } = imports.gi;

const { Settings } = imports.gi.Gio;

import * as settings from 'settings';

interface AppWidgets {
    window_titles: any,
    snap_to_grid: any,
    search_engine: any,
    outer_gap: any,
    inner_gap: any,
}

const SEARCH_ENGINES: SearchEngine[] = [
    settings.SearchEngine.Bing,
    settings.SearchEngine.DuckDuckGo,
    settings.SearchEngine.Google
];

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

    const current_engine = ext.search_engine();
    app.search_engine.set_active(SEARCH_ENGINES.findIndex(engine => engine === current_engine));
    app.search_engine.connect('changed', () => {
        ext.set_search_engine(SEARCH_ENGINES[app.search_engine.get_active()]);
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

    grid.attach(win_label, 0, 0, 1, 1);
    grid.attach(window_titles, 1, 0, 1, 1);

    grid.attach(snap_label, 0, 1, 1, 1);
    grid.attach(snap_to_grid, 1, 1, 1, 1);

    const search_engine = search_engine_section(grid, 2);

    let [inner_gap, outer_gap] = gaps_section(grid, 3);

    let settings = { inner_gap, outer_gap, snap_to_grid, window_titles, search_engine };

    return [settings, grid];
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

function search_engine_section(grid: any, top: number): any {
    const label = new Gtk.Label({
        label: "Search Engine",
        xalign: 0.0
    });

    const combo_box = new Gtk.ComboBoxText();
    SEARCH_ENGINES.forEach(engine => {
        combo_box.append_text(engine);
    });

    grid.attach(label, 0, top, 1, 1);
    grid.attach(combo_box, 1, top, 1, 1);

    return combo_box;
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
