const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

function log(text) {
    global.log("pop-shell: " + text);
}

function settings() {
  const extension = ExtensionUtils.getCurrentExtension();
  const schema = extension.metadata["settings-schema"];
  const GioSSS = Gio.SettingsSchemaSource;
  const schemaDir = extension.dir.get_child("schemas");
  let schemaSource = schemaDir.query_exists(null) ?
        GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false) :
        GioSSS.get_default();

  const schemaObj = schemaSource.lookup(schema, true);
  if (!schemaObj)
    throw new Error("Schema " + schema + " could not be found for extension "
                    + extension.metadata.uuid + ". Please check your installation.");
  let settings = new Gio.Settings({ settings_schema: schemaObj });
  return settings;
}

function window_app_name(win) {
    let app = Shell.WindowTracker.get_default().get_window_app(win);
    let name = null;
    try {
      name = app.get_name().replace(/&/g, "&amp;");
    } catch (e) {
      log("window_app_name: " + e);
    }
    return name;
}

function focus_left() {
    log("focus_left");

    let focused = global.display.focus_window;
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, null)
        .filter(function (win) {
            return win.get_frame_rect().x < focused.get_frame_rect().x;
        })
        .sort(function (a, b) {
            return b.get_frame_rect().x - a.get_frame_rect().x;
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function focus_right() {
    log("focus_right");

    let focused = global.display.focus_window;
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, null)
        .filter(function (win) {
            return win.get_frame_rect().x > focused.get_frame_rect().x;
        })
        .sort(function (a, b) {
            return a.get_frame_rect().x - b.get_frame_rect().x;
        });
    windows.forEach(function (win, i) {
        log("  " + win.get_title());
        if (i == 0) {
            win.activate(global.get_current_time());
        }
    });
}

function search() {
    log("search");

    let windows = global.display.get_tab_list(Meta.TabList.NORMAL, null);
    windows.forEach(function (win) {
        let name = window_app_name(win);
        let title = "";
        if (name) {
            title += name + ": ";
        }
        title += win.get_title();
        log("  " + title);
    });
}

function init() {
    log("init");
}

function enable() {
    log("enable");

    Main.wm.addKeybinding(
        "focus-left",
        settings(),
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => focus_left()
    );

    Main.wm.addKeybinding(
        "focus-right",
        settings(),
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => focus_right()
    );

    Main.wm.addKeybinding(
        "search",
        settings(),
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => search()
    );
}

function disable() {
    log("disable");

    Main.wm.removeKeybinding("search");
}
