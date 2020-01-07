const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;

var Settings = class Settings {
    constructor() {
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
        this.inner = new Gio.Settings({ settings_schema: schemaObj });
    }

    gap() {
        return this.inner.get_uint("gap");
    }
}
