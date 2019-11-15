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

function search() {
    log("search");

    let tabList = global.display.get_tab_list(Meta.TabList.NORMAL, null);
    tabList.forEach(function(win) {
        let app = Shell.WindowTracker.get_default().get_window_app(win);
        let name = "";
        try {
          name = app.get_name().replace(/&/g, "&amp;");
        } catch (e) {
          log(e);
        }

        log(name + ": " + win.get_title());
    });
}

function init() {
    log("init");
}

function enable() {
    log("enable");

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
