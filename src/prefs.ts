export { };

const ExtensionUtils = imports.misc.extensionUtils;
// @ts-ignore
const Me = ExtensionUtils.getCurrentExtension();

const { Gtk } = imports.gi;

const { Settings } = imports.gi.Gio;

import * as focus from 'focus';
import * as log from 'log';
import * as settings from 'settings';

interface AppWidgets {
  fullscreen_launcher: any;
  stacking_with_mouse: any;
  inner_gap: any;
  mouse_cursor_follows_active_window: any;
  outer_gap: any;
  show_skip_taskbar: any;
  smart_gaps: any;
  auto_unstack: any;
  snap_to_grid: any;
  window_titles: any;
  mouse_cursor_focus_position: any;
  log_level: any;
}

// @ts-ignore
function init() {}

function settings_dialog_new(): Gtk.Container {
  let [app, grid] = settings_dialog_view();

  let ext = new settings.ExtensionSettings();

  app.window_titles.set_active(ext.show_title());
  app.window_titles.connect("state-set", (_widget: any, state: boolean) => {
    ext.set_show_title(state);
    Settings.sync();
  });

  app.snap_to_grid.set_active(ext.snap_to_grid());
  app.snap_to_grid.connect("state-set", (_widget: any, state: boolean) => {
    ext.set_snap_to_grid(state);
    Settings.sync();
  });

  app.smart_gaps.set_active(ext.smart_gaps());
  app.smart_gaps.connect("state-set", (_widget: any, state: boolean) => {
    ext.set_smart_gaps(state);
    Settings.sync();
  });

  app.auto_unstack.set_active(ext.auto_unstack());
  app.auto_unstack.connect("state-set", (_widget: any, state: boolean) => {
    ext.set_auto_unstack(state);
    Settings.sync();
  });

  app.outer_gap.set_text(String(ext.gap_outer()));
  app.outer_gap.connect("activate", (widget: any) => {
    let parsed = parseInt((widget.get_text() as string).trim());
    if (!isNaN(parsed)) {
      ext.set_gap_outer(parsed);
      Settings.sync();
    }
  });

  app.inner_gap.set_text(String(ext.gap_inner()));
  app.inner_gap.connect("activate", (widget: any) => {
    let parsed = parseInt((widget.get_text() as string).trim());
    if (!isNaN(parsed)) {
      ext.set_gap_inner(parsed);
      Settings.sync();
    }
  });

  app.log_level.set_active(ext.log_level());
  app.log_level.connect("changed", () => {
    let active_id = app.log_level.get_active_id();
    ext.set_log_level(active_id);
  });

  app.show_skip_taskbar.set_active(ext.show_skiptaskbar());
  app.show_skip_taskbar.connect("state-set", (_widget: any, state: boolean) => {
    ext.set_show_skiptaskbar(state);
    Settings.sync();
  });

  app.mouse_cursor_follows_active_window.set_active(
    ext.mouse_cursor_follows_active_window()
  );
  app.mouse_cursor_follows_active_window.connect(
    "state-set",
    (_widget: any, state: boolean) => {
      ext.set_mouse_cursor_follows_active_window(state);
      Settings.sync();
    }
  );

  app.mouse_cursor_focus_position.set_active(ext.mouse_cursor_focus_location());
  app.mouse_cursor_focus_position.connect("changed", () => {
    let active_id = app.mouse_cursor_focus_position.get_active_id();
    ext.set_mouse_cursor_focus_location(active_id);
  });

  app.fullscreen_launcher.set_active(ext.fullscreen_launcher());
  app.fullscreen_launcher.connect(
    "state-set",
    (_widget: any, state: boolean) => {
      ext.set_fullscreen_launcher(state);
      Settings.sync();
    }
  );

  app.stacking_with_mouse.set_active(ext.stacking_with_mouse());
  app.stacking_with_mouse.connect(
    "state-set",
    (_widget: any, state: boolean) => {
      ext.set_stacking_with_mouse(state);
      Settings.sync();
    }
  );

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
  });

  const win_label = new Gtk.Label({
    label: "Show Window Titles",
    xalign: 0.0,
    hexpand: true,
  });

  const snap_label = new Gtk.Label({
    label: "Snap to Grid (Floating Mode)",
    xalign: 0.0,
  });

  const smart_label = new Gtk.Label({
    label: "Smart Gaps",
    xalign: 0.0,
  });

  const unstack_label = new Gtk.Label({
    label: "Automatically destroy single-window stacks",
    xalign: 0.0,
  });

  const show_skip_taskbar_label = new Gtk.Label({
    label: "Show Minimize to Tray Windows",
    xalign: 0.0,
  });

  const mouse_cursor_follows_active_window_label = new Gtk.Label({
    label: "Mouse Cursor Follows Active Window",
    xalign: 0.0,
  });

  const fullscreen_launcher_label = new Gtk.Label({
    label: "Allow launcher over fullscreen window",
    xalign: 0.0,
  });

  const stacking_with_mouse = new Gtk.Label({
    label: "Allow stacking with mouse",
    xalign: 0.0,
  });

  const [inner_gap, outer_gap] = gaps_section(grid, 10);

  const settings = {
    inner_gap,
    outer_gap,
    fullscreen_launcher: new Gtk.Switch({ halign: Gtk.Align.END }),
    stacking_with_mouse: new Gtk.Switch({ halign: Gtk.Align.END }),
    smart_gaps: new Gtk.Switch({ halign: Gtk.Align.END }),
    auto_unstack: new Gtk.Switch({ halign: Gtk.Align.END }),
    snap_to_grid: new Gtk.Switch({ halign: Gtk.Align.END }),
    window_titles: new Gtk.Switch({ halign: Gtk.Align.END }),
    show_skip_taskbar: new Gtk.Switch({ halign: Gtk.Align.END }),
    mouse_cursor_follows_active_window: new Gtk.Switch({
      halign: Gtk.Align.END,
    }),
    mouse_cursor_focus_position: build_combo(
      grid,
      8,
      focus.FocusPosition,
      "Mouse Cursor Focus Position"
    ),
    log_level: build_combo(grid, 9, log.LOG_LEVELS, "Log Level"),
  };

  grid.attach(win_label, 0, 0, 1, 1);
  grid.attach(settings.window_titles, 1, 0, 1, 1);

  grid.attach(snap_label, 0, 1, 1, 1);
  grid.attach(settings.snap_to_grid, 1, 1, 1, 1);

  grid.attach(smart_label, 0, 2, 1, 1);
  grid.attach(settings.smart_gaps, 1, 2, 1, 1);

  grid.attach(unstack_label, 0, 3, 1, 1);
  grid.attach(settings.auto_unstack, 1, 3, 1, 1);

  grid.attach(fullscreen_launcher_label, 0, 4, 1, 1);
  grid.attach(settings.fullscreen_launcher, 1, 4, 1, 1);

  grid.attach(stacking_with_mouse, 0, 5, 1, 1);
  grid.attach(settings.stacking_with_mouse, 1, 5, 1, 1);

  grid.attach(show_skip_taskbar_label, 0, 6, 1, 1);
  grid.attach(settings.show_skip_taskbar, 1, 6, 1, 1);

  grid.attach(mouse_cursor_follows_active_window_label, 0, 7, 1, 1);
  grid.attach(settings.mouse_cursor_follows_active_window, 1, 7, 1, 1);

  return [settings, grid];
}

function gaps_section(grid: any, top: number): [any, any] {
  let outer_label = new Gtk.Label({
    label: "Outer",
    xalign: 0.0,
    margin_start: 24,
  });

  let outer_entry = number_entry();

  let inner_label = new Gtk.Label({
    label: "Inner",
    xalign: 0.0,
    margin_start: 24,
  });

  let inner_entry = number_entry();

  let section_label = new Gtk.Label({
    label: "Gaps",
    xalign: 0.0,
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

function build_combo(
  grid: any,
  top_index: number,
  iter_enum: any,
  label: string
) {
  let label_ = new Gtk.Label({
    label: label,
    halign: Gtk.Align.START,
  });

  grid.attach(label_, 0, top_index, 1, 1);

  let combo = new Gtk.ComboBoxText();

  for (const [index, key] of Object.keys(iter_enum).entries()) {
    if (typeof iter_enum[key] == "string") {
      combo.append(`${index}`, iter_enum[key]);
    }
  }

  grid.attach(combo, 1, top_index, 1, 1);
  return combo;
}

// @ts-ignore
function buildPrefsWidget() {
  let dialog = settings_dialog_new();
  if (dialog.show_all) {
    dialog.show_all();
  } else {
    dialog.show();
  }
  return dialog;
}
