const ExtensionUtils = imports.misc.extensionUtils;
const extension = ExtensionUtils.getCurrentExtension();
const Gio = imports.gi.Gio;

const DARK = ['dark', 'adapta', 'plata', 'dracula']

interface Settings extends GObject.Object {
    get_boolean(key: string): boolean;
    set_boolean(key: string, value: boolean): void;

    get_uint(key: string): number;
    set_uint(key: string, value: number): void;

    get_string(key: string): string;
}

function settings_new_id(schema_id: string): Settings | null {
    try {
        return new Gio.Settings({ schema_id });
    } catch (err) {
        if (schema_id !== 'org.gnome.shell.extensions.user-theme') {
            global.log(err)
        }

        return null
    }
}

function settings_new_schema(schema: string): Settings {
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

    return new Gio.Settings({ settings_schema: schemaObj });
}

const ACTIVE_HINT = 'active-hint';
const COLUMN_SIZE = 'column-size';
const GAP_INNER = 'gap-inner';
const GAP_OUTER = 'gap-outer';
const ROW_SIZE = 'row-size';
const SHOW_TITLE = 'show-title';
const SMART_GAPS = 'smart-gaps';
const SNAP_TO_GRID = 'snap-to-grid';
const TILE_BY_DEFAULT = 'tile-by-default';

export class ExtensionSettings {
    ext: Settings = settings_new_schema(extension.metadata['settings-schema']);
    int: Settings | null = settings_new_id('org.gnome.desktop.interface');
    mutter: Settings | null = settings_new_id('org.gnome.mutter');
    shell: Settings | null = settings_new_id('org.gnome.shell.extensions.user-theme');

    // Getters

    active_hint(): boolean {
        return this.ext.get_boolean(ACTIVE_HINT);
    }

    column_size(): number {
        return this.ext.get_uint(COLUMN_SIZE);
    }

    gap_inner(): number {
        return this.ext.get_uint(GAP_INNER);
    }

    gap_outer(): number {
        return this.ext.get_uint(GAP_OUTER);
    }

    is_dark(): boolean {
        if (this.int) {
            let theme = this.int.get_string('gtk-theme').toLowerCase();
            return DARK.some(dark => theme.includes(dark))
        }

        return false
    }

    is_dark_shell(): boolean {
        if (this.shell) {
            let theme = this.shell.get_string('name').toLowerCase()
            return DARK.some(dark => theme.includes(dark) || theme.length === 0)
        }
        return this.is_dark();
    }

    row_size(): number {
        return this.ext.get_uint(ROW_SIZE);
    }

    show_title(): boolean {
        return this.ext.get_boolean(SHOW_TITLE);
    }

    smart_gaps(): boolean {
        return this.ext.get_boolean(SMART_GAPS);
    }

    snap_to_grid(): boolean {
        return this.ext.get_boolean(SNAP_TO_GRID);
    }

    tile_by_default(): boolean {
        return this.ext.get_boolean(TILE_BY_DEFAULT);
    }

    workspaces_only_on_primary(): boolean {
        return this.mutter
            ? this.mutter.get_boolean('workspaces-only-on-primary')
            : false;
    }

    // Setters

    set_active_hint(set: boolean) {
        this.ext.set_boolean(ACTIVE_HINT, set);
    }

    set_column_size(size: number) {
        this.ext.set_uint(COLUMN_SIZE, size);
    }

    set_gap_inner(gap: number) {
        this.ext.set_uint(GAP_INNER, gap);
    }

    set_gap_outer(gap: number) {
        this.ext.set_uint(GAP_OUTER, gap);
    }

    set_row_size(size: number) {
        this.ext.set_uint(ROW_SIZE, size);
    }

    set_show_title(set: boolean) {
        this.ext.set_boolean(SHOW_TITLE, set);
    }

    set_smart_gaps(set: boolean) {
        this.ext.set_boolean(SMART_GAPS, set);
    }

    set_snap_to_grid(set: boolean) {
        this.ext.set_boolean(SNAP_TO_GRID, set);
    }

    set_tile_by_default(set: boolean) {
        this.ext.set_boolean(TILE_BY_DEFAULT, set);
    }
}
