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

const COLUMN_SIZE = 'column-size';
const GAP_INNER = 'gap-inner';
const GAP_OUTER = 'gap-outer';
const ROW_SIZE = 'row-size';
const SHOW_TITLE = 'show-title';
const TILE_BY_DEFAULT = 'tile-by-default';

var ExtensionSettings = class ExtensionSettings extends Settings {
    constructor() {
        super(extension.metadata['settings-schema']);
    }

    column_size() {
        return this.inner.get_uint(COLUMN_SIZE);
    }

    gap_inner() {
        return this.inner.get_uint(GAP_INNER);
    }

    gap_outer() {
        return this.inner.get_uint(GAP_OUTER);
    }

    row_size() {
        return this.inner.get_uint(ROW_SIZE);
    }

    show_title() {
        return this.inner.get_boolean(SHOW_TITLE);
    }

    tile_by_default() {
        return this.inner.get_boolean(TILE_BY_DEFAULT);
    }

    set_column_size(size) {
        this.inner.set_uint(COLUMN_SIZE, size);
    }

    set_gap_inner(gap) {
        this.inner.set_uint(GAP_INNER, gap);
    }

    set_gap_outer(gap) {
        this.inner.set_uint(GAP_OUTER, gap);
    }

    set_row_size(size) {
        this.inner.set_uint(ROW_SIZE, size);
    }

    set_show_title(set) {
        this.inner.set_boolean(SHOW_TITLE, set);
    }

    set_tile_by_default(set) {
        this.inner.set_boolean(TILE_BY_DEFAULT, set);
    }
}
