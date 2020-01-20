const ExtensionUtils = imports.misc.extensionUtils;
const extension = ExtensionUtils.getCurrentExtension();
const Gio = imports.gi.Gio;

var Settings = class Settings {
    constructor(schema) {
        const GioSSS = Gio.SettingsSchemaSource;
        const schemaDir = extension.dir.get_child("schemas");

        let schemaSource = schemaDir.query_exists(null) ?
            GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false) :
            GioSSS.get_default();

        const schemaObj = schemaSource.lookup(schema, true);

        if (!schemaObj) {
            throw new Error("Schema " + schema + " could not be found for extension "
                + extension.metadata.uuid + ". Please check your installation.")
        }

        this.inner = new Gio.Settings({ settings_schema: schemaObj });
    }
}

var ExtensionSettings = class ExtensionSettings extends Settings {
    constructor() {
        super(extension.metadata['settings-schema']);
    }

    gap() {
        return this.inner.get_uint('gap-inner');
    }

    tile_by_default() {
        return this.inner.get_boolean('tile-by-default');
    }
}
