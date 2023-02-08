const Me = imports.misc.extensionUtils.getCurrentExtension();

const { Gio, Gdk } = imports.gi;

const DARK = ["dark", "adapta", "plata", "dracula"]

interface Settings extends GObject.Object {
    get_boolean(key: string): boolean;
    set_boolean(key: string, value: boolean): void;

    get_uint(key: string): number;
    set_uint(key: string, value: number): void;

    get_string(key: string): string;
    set_string(key: string, value: string): void;

    bind(key: string, object: GObject.Object, property: string, flags: any): void
}

function settings_new_id(schema_id: string): Settings | null {
    try {
        return new Gio.Settings({ schema_id });
    } catch (why) {
        if (schema_id !== "org.gnome.shell.extensions.user-theme") {
            global.log(`failed to get settings for ${schema_id}: ${why}`)
        }

        return null
    }
}

function settings_new_schema(schema: string): Settings {
    const GioSSS = Gio.SettingsSchemaSource;
    const schemaDir = Me.dir.get_child("schemas");

    let schemaSource = schemaDir.query_exists(null) ?
        GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false) :
        GioSSS.get_default();

    const schemaObj = schemaSource.lookup(schema, true);

    if (!schemaObj) {
        throw new Error("Schema " + schema + " could not be found for extension "
            + Me.metadata.uuid + ". Please check your installation.")
    }

    return new Gio.Settings({ settings_schema: schemaObj });
}

const ACTIVE_HINT = "active-hint";
const ACTIVE_HINT_BORDER_RADIUS = "active-hint-border-radius";
const STACKING_WITH_MOUSE = "stacking-with-mouse";
const COLUMN_SIZE = "column-size";
const EDGE_TILING = "edge-tiling";
const FULLSCREEN_LAUNCHER = "fullscreen-launcher"
const GAP_INNER = "gap-inner";
const GAP_OUTER = "gap-outer";
const ROW_SIZE = "row-size";
const SHOW_TITLE = "show-title";
const SMART_GAPS = "smart-gaps";
const SNAP_TO_GRID = "snap-to-grid";
const TILE_BY_DEFAULT = "tile-by-default";
const HINT_COLOR_RGBA = "hint-color-rgba";
const DEFAULT_RGBA_COLOR = "rgba(251, 184, 108, 1)"; //pop-orange
const LOG_LEVEL = "log-level";
const SHOW_SKIPTASKBAR = "show-skip-taskbar";
const MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW = "mouse-cursor-follows-active-window"
const MOUSE_CURSOR_FOCUS_LOCATION = "mouse-cursor-focus-location";

export class ExtensionSettings {
    ext: Settings = settings_new_schema(Me.metadata["settings-schema"]);
    int: Settings | null = settings_new_id("org.gnome.desktop.interface");
    mutter: Settings | null = settings_new_id("org.gnome.mutter");
    shell: Settings | null = settings_new_id("org.gnome.shell.extensions.user-theme");

    // Getters

    active_hint(): boolean {
        return this.ext.get_boolean(ACTIVE_HINT);
    }

    active_hint_border_radius(): number {
        return this.ext.get_uint(ACTIVE_HINT_BORDER_RADIUS);
    }

    stacking_with_mouse(): boolean {
        return this.ext.get_boolean(STACKING_WITH_MOUSE);
    }

    column_size(): number {
        return this.ext.get_uint(COLUMN_SIZE);
    }

    dynamic_workspaces(): boolean {
        return this.mutter ? this.mutter.get_boolean("dynamic-workspaces") : false;
    }

    fullscreen_launcher(): boolean {
        return this.ext.get_boolean(FULLSCREEN_LAUNCHER)
    }

    gap_inner(): number {
        return this.ext.get_uint(GAP_INNER);
    }

    gap_outer(): number {
        return this.ext.get_uint(GAP_OUTER);
    }

    hint_color_rgba() {
        let rgba = this.ext.get_string(HINT_COLOR_RGBA);
        let valid_color = new Gdk.RGBA().parse(rgba);

        if (!valid_color) {
            return DEFAULT_RGBA_COLOR;
        }

        return rgba;
    }

    theme(): string {
        return this.shell
            ? this.shell.get_string("name")
            : this.int
                ? this.int.get_string("gtk-theme")
                : "Adwaita"
    }

    is_dark(): boolean {
        const theme = this.theme().toLowerCase()
        return DARK.some(dark => theme.includes(dark))
    }

    is_high_contrast(): boolean {
        return this.theme().toLowerCase() === "highcontrast"
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
            ? this.mutter.get_boolean("workspaces-only-on-primary")
            : false;
    }

    log_level(): number {
        return this.ext.get_uint(LOG_LEVEL);
    }

    show_skiptaskbar(): boolean {
        return this.ext.get_boolean(SHOW_SKIPTASKBAR);
    }

    mouse_cursor_follows_active_window(): boolean {
        return this.ext.get_boolean(MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW);
    }

    mouse_cursor_focus_location(): number {
        return this.ext.get_uint(MOUSE_CURSOR_FOCUS_LOCATION);
    }

    // Setters

    set_active_hint(set: boolean) {
        this.ext.set_boolean(ACTIVE_HINT, set);
    }

    set_active_hint_border_radius(set: number) {
        this.ext.set_uint(ACTIVE_HINT_BORDER_RADIUS, set);
    }

    set_stacking_with_mouse(set: boolean) {
        this.ext.set_boolean(STACKING_WITH_MOUSE, set);
    }

    set_column_size(size: number) {
        this.ext.set_uint(COLUMN_SIZE, size);
    }

    set_edge_tiling(enable: boolean) {
        this.mutter?.set_boolean(EDGE_TILING, enable)
    }

    set_fullscreen_launcher(enable: boolean) {
        this.ext.set_boolean(FULLSCREEN_LAUNCHER, enable)
    }

    set_gap_inner(gap: number) {
        this.ext.set_uint(GAP_INNER, gap);
    }

    set_gap_outer(gap: number) {
        this.ext.set_uint(GAP_OUTER, gap);
    }

    set_hint_color_rgba(rgba: string) {
        let valid_color = new Gdk.RGBA().parse(rgba);

        if (valid_color) {
            this.ext.set_string(HINT_COLOR_RGBA, rgba);
        } else {
            this.ext.set_string(HINT_COLOR_RGBA, DEFAULT_RGBA_COLOR);
        }
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

    set_log_level(set: number) {
        this.ext.set_uint(LOG_LEVEL, set);
    }

    set_show_skiptaskbar(set: boolean) {
        this.ext.set_boolean(SHOW_SKIPTASKBAR, set);
    }

    set_mouse_cursor_follows_active_window(set: boolean) {
        this.ext.set_boolean(MOUSE_CURSOR_FOLLOWS_ACTIVE_WINDOW, set);
    }

    set_mouse_cursor_focus_location(set: number) {
        this.ext.set_uint(MOUSE_CURSOR_FOCUS_LOCATION, set);
    }
}
