export { }

const ExtensionUtils = imports.misc.extensionUtils;
// @ts-ignore
const Me = ExtensionUtils.getCurrentExtension();
const { Gdk, GdkPixbuf, Gio, GObject, Gtk } = imports.gi;
const { Settings } = imports.gi.Gio;

import * as settings from 'settings';
import * as logger from 'log';
import * as constants from 'constants';

interface AppWidgets {
    inner_gap: any,
    outer_gap: any,
    smart_gaps: any,
    snap_to_grid: any,
    window_titles: any,
}

const on_pop = false;

// @ts-ignore
function init() {

}

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

    let snap_label = new Gtk.Label({
        label: "Snap to Grid (Floating Mode)",
        xalign: 0.0
    });

    let smart_label = new Gtk.Label({
        label: "Smart Gaps",
        xalign: 0.0
    });

    let window_titles = new Gtk.Switch({ halign: Gtk.Align.START });

    let snap_to_grid = new Gtk.Switch({ halign: Gtk.Align.START });

    let smart_gaps = new Gtk.Switch({ halign: Gtk.Align.START });

    grid.attach(win_label, 0, 0, 1, 1);
    grid.attach(window_titles, 1, 0, 1, 1);

    grid.attach(snap_label, 0, 1, 1, 1);
    grid.attach(snap_to_grid, 1, 1, 1, 1);

    grid.attach(smart_label, 0, 2, 1, 1);
    grid.attach(smart_gaps, 1, 2, 1, 1);

    logging_combo(grid, 3);

    let [inner_gap, outer_gap] = gaps_section(grid, 4);

    let settings = { inner_gap, outer_gap, smart_gaps, snap_to_grid, window_titles };

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

    for (const key in logger.LOG_LEVELS) {
        // since log level loop will contain key and level,
        // then cherry-pick the number, key will be the text value
        if (typeof logger.LOG_LEVELS[key] === 'number') {
            log_combo.append(`${logger.LOG_LEVELS[key]}`, key);
        }
    }

    let current_log_level = logger.log_level();

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
    let prefsWidget;
    if (!on_pop) { // give distributors the option to show
        prefsWidget = new PopshellPrefsWidget();
    } else {
        prefsWidget = settings_dialog_new();
    }
    prefsWidget.show_all();
    return prefsWidget;
}

/** 
 * Expand the prefs widget and organized similar to GNOME Control Center.
 * 
 * TODO: 
 * - Make settings searchable, and use mnemonics
 * - Import/Export
 * - Profiles concept
 * - Window Animations toggle
 */
export var PopshellPrefsWidget = GObject.registerClass(class Popshell_PrefsWidget extends Gtk.Box {

    settings_stack: any;
    settings_pages_stack: any;
    left_header_box: any;
    left_panel_box: any;
    back_button: any;
    accel_group: any;
    private ext_settings: settings.ExtensionSettings = new settings.ExtensionSettings();

    _init() {

        // Pass some metadata to the parent class
        super._init({
            orientation: Gtk.Orientation.HORIZONTAL,
            border_width: 0,
            margin: 0,
            width_request: 750,
            height_request: 550
        });

        this.ext_settings = new settings.ExtensionSettings();

        // make sure the Gtk.Window parent is initialized
        this.connect('realize', () => {
            this.left_header_box = new Gtk.Box({
                hexpand: true,
                visible: true
            });

            let prefs_accel_group = new Gtk.AccelGroup();
            this.accel_group = prefs_accel_group;

            let window = this.get_toplevel();
            window.set_title(constants.PREFS_WINDOW_TITLE);
            window.get_titlebar().pack_start(this.left_header_box);
            window.add_accel_group(prefs_accel_group);
            window.set_modal(true);
            window.set_type_hint(Gdk.WindowTypeHint.DIALOG);
            window.set_resizable(false);

            /** Close the prefs widget on escape */
            window.connect('key-press-event', (_self: any, keyevent: any) => {
                let [, val] = keyevent.get_keyval();
                if (val === Gdk.KEY_Escape) {
                    window.close();
                }
                return false;
            });
        });

        // settings category list on the left panel
        this.settings_stack = new Gtk.Stack({
            hhomogeneous: true,
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT
        });

        // list for the pages of each setting category
        this.settings_pages_stack = new Gtk.Stack({
            hhomogeneous: true,
            transition_type: Gtk.StackTransitionType.CROSSFADE
        });

        // draw the left container box for the settings category list
        this.left_panel_box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });

        // Back Button
        let back_button = new Gtk.Button({
            image: new Gtk.Image({ icon_name: 'go-previous-symbolic' }),
            visible: true
        });
        this.back_button = back_button;

        back_button.connect('clicked', (_self: any) => {
            this.return_to_top();
            this.left_header_box.remove(this.back_button);
            this.remove_back_button_accelerator();
        });

        this.left_panel_box.add(this.settings_stack);

        // finally, add the complex widgets
        this.add(this.left_panel_box);
        this.add(Gtk.Separator.new(Gtk.Orientation.VERTICAL));
        this.add(this.settings_pages_stack);

        this.build_settings_list();
        this.build_settings_panels();
    }

    return_to_top() {
        let general_stack = this.settings_stack.get_child_by_name('General');
        this.settings_stack.visible_child = general_stack;
        general_stack.activate_first_row();
    }

    add_back_button_accelerator() {
        let back_button = this.back_button;
        // Make it keyboard friendly
        let back_button_shortcut = `<Alt>Left`;
        let [back_button_key, back_button_mod] = Gtk.accelerator_parse(back_button_shortcut);
        back_button.add_accelerator(`clicked`, this.accel_group, back_button_key, back_button_mod, Gtk.AccelFlags.VISIBLE);
    }

    remove_back_button_accelerator() {
        let back_button = this.back_button;
        let back_button_shortcut = `<Alt>Left`;
        let [back_button_key, back_button_mod] = Gtk.accelerator_parse(back_button_shortcut);
        back_button.remove_accelerator(this.accel_group, back_button_key, back_button_mod);
    }

    /**
     * Build the Settings list displayed on the left panel box
     */
    private build_settings_list(): void {
        const left_box_width = 220;

        let general_settings_box = new PopShellScrollStackBox(this, { width_request: left_box_width });
        general_settings_box.add_stack_row('Main', 'Main', `go-home-symbolic`);
        general_settings_box.add_stack_row('Modes', 'Modes', `${Me.path}/icons/prefs/pop-shell-main-symbolic.svg`, 'ModeSettings');
        general_settings_box.add_stack_row('Appearance', 'Appearance', `${Me.path}/icons/prefs/preferences-desktop-wallpaper-symbolic.svg`, 'AppearanceSettings');
        general_settings_box.add_stack_row('Keyboard', 'Keyboard', `${Me.path}/icons/prefs/input-keyboard-symbolic.svg`, 'KeyboardSettings');
        general_settings_box.add_stack_row('Development', 'Development', `${Me.path}/icons/prefs/code-context-symbolic.svg`);
        general_settings_box.add_stack_row('Experimental', 'Experimental', `${Me.path}/icons/prefs/applications-science-symbolic.svg`);
        general_settings_box.add_stack_row('About', 'About', `${Me.path}/icons/prefs/pop-os-logo-symbolic.svg`);
        this.settings_stack.add_named(general_settings_box, 'General');

        // Tiling, Window, Stack Mode Settings
        let mode_settings_box = new PopShellScrollStackBox(this, { width_request: left_box_width });
        mode_settings_box.add_stack_row('Tiling', 'Tiling', `${Me.path}/icons/prefs/view-grid-symbolic.svg`);
        mode_settings_box.add_stack_row('Floating', 'Floating', `${Me.path}/icons/prefs/window-duplicate-symbolic.svg`);
        mode_settings_box.add_stack_row('Stacking', 'Stacking', `${Me.path}/icons/prefs/tab-new-symbolic.svg`);
        this.settings_stack.add_named(mode_settings_box, 'ModeSettings');

        // Appearance Settings
        let appearance_settings_box = new PopShellScrollStackBox(this, { width_request: left_box_width });
        appearance_settings_box.add_stack_row('Active Hint', 'Active Hint', `${Me.path}/icons/prefs/window-symbolic.svg`);
        appearance_settings_box.add_stack_row('Windows', 'Windows', `${Me.path}/icons/prefs/focus-windows-symbolic.svg`);
        this.settings_stack.add_named(appearance_settings_box, 'AppearanceSettings');

        // Keyboard Settings
        let keyboard_settings_box = new PopShellScrollStackBox(this, { width_request: left_box_width });
        keyboard_settings_box.add_stack_row('Shortcuts', 'Shortcuts', `${Me.path}/icons/prefs/preferences-desktop-keyboard-symbolic.svg`);
        keyboard_settings_box.add_stack_row('Restore', 'Restore', `${Me.path}/icons/prefs/appointment-soon-symbolic.svg`);
        this.settings_stack.add_named(keyboard_settings_box, 'KeyboardSettings');
    }

    /**
     * Build the pages for each setting
     */
    private build_settings_panels(): void {
        // Split up the current page into each of the new categories

        // The top level settings
        this.settings_pages_stack.add_named(new PopShellMainSettingsPanel(this.ext_settings), 'Main');
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Modes');
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Appearance');
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Keyboard');
        this.settings_pages_stack.add_named(new PopShellDevelopmentPanel(this.ext_settings), 'Development');
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Experimental');
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'About');

        // The Tiling page
        this.settings_pages_stack.add_named(new PopShellTilingPanel(this.ext_settings), 'Tiling');

        // The Floating page
        this.settings_pages_stack.add_named(new PopShellFloatingPanel(this.ext_settings), 'Floating');

        // Stacking page
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Stacking');

        // Active Hint
        this.settings_pages_stack.add_named(new PopShellActiveHintPanel(this.ext_settings), 'Active Hint');

        // Windows page, etc
        this.settings_pages_stack.add_named(new PopShellWindowsPanel(this.ext_settings), 'Windows');

        // Shortcuts page
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Shortcuts');

        // Keyboard shortcuts page
        this.settings_pages_stack.add_named(new PopShellUnderConstructionPanel('Main'), 'Restore');

        if (this.back_button.get_parent()) {
            this.left_header_box.remove(this.back_button);
            this.remove_back_button_accelerator();
        }

        this.return_to_top();

        // Finally, show everything
        this.show_all();
    }
});

var PopShellScrollStackBox = GObject.registerClass(class PopShell_ScrollStackBox extends Gtk.ScrolledWindow {

    prefs_widget: any;
    list_box: any;

    _init(prefs_widget: any, params: any) {

        super._init({
            valign: Gtk.Align.FILL,
            vexpand: true
        });

        this.list_box = new Gtk.ListBox({
            hexpand: false,
            valign: Gtk.Align.FILL,
            vexpand: true,
            width_request: params.width_request,
            activate_on_single_click: true
        });

        this.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.add_with_viewport(this.list_box);
        this.prefs_widget = prefs_widget;

        this.bind_events();
    }

    private bind_events() {
        let list_box = this.list_box;

        list_box.connect('row-activated', (_self: any, row: any) => this.on_row_load(_self, row));
        list_box.connect('row-selected', (_self: any, row: any) => {
            let list_row = row.get_children()[0];
            // Always check if the listbox row has children - 
            // So when no child, autoload, else activate the next child by clicking or return key.
            if (!list_row.child_name) {
                this.on_row_load(_self, row);
            }
        });
    }

    private on_row_load(_self: any, row: any) {
        let prefs_widget = this.prefs_widget;
        let settings_stack = prefs_widget.settings_stack;

        if (row) {
            let list_row = row.get_children()[0];
            let stack_name = list_row.stack_name;

            prefs_widget.settings_pages_stack.set_visible_child_name(stack_name);

            if (list_row.child_name) {

                settings_stack.set_visible_child_name(list_row.child_name);
                let child_row_scroll_win = settings_stack.get_child_by_name(list_row.child_name);
                child_row_scroll_win.activate_first_row();


                if (prefs_widget.left_header_box) {
                    prefs_widget.left_header_box.add(prefs_widget.back_button);
                    prefs_widget.add_back_button_accelerator();
                }

            }
        }
    }

    select_first_row() {
        let list_box = this.list_box;
        list_box.select_row(this.get_row_at_index(0));
    }

    activate_first_row() {
        let list_box = this.list_box;
        list_box.get_row_at_index(0).activate();
    }

    /**
     * Adds a row in the stack
     * @param name - row name for the stack to query
     * @param label_name - the name to display
     * @param icon_path - path to the icon
     * @param child_name
     */
    add_stack_row(name: string, label_name: string, icon_path: string, child_name: any) {
        let row = new Gtk.Grid({ margin: 12, column_spacing: 10 });
        row.stack_name = name;
        row.label_name = label_name;

        let icon_image = new Gtk.Image({
            gicon: Gio.icon_new_for_string(icon_path)
        });

        let label = new Gtk.Label({
            label: label_name,
            halign: Gtk.Align.START,
        });
        row.add(icon_image);
        row.add(label);

        if (child_name) {
            row.child_name = child_name;
            let next_page_icon = new Gtk.Image({
                gicon: Gio.icon_new_for_string('go-next-symbolic'),
                halign: Gtk.Align.END,
                hexpand: true
            });
            row.add(next_page_icon);
        }

        this.list_box.add(row);
    }

});

var PopShellPanel = GObject.registerClass(class PopShell_Panel extends Gtk.Box {

    private _title: any;

    _init(title: string) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            margin: 24,
            spacing: 20,
            homogeneous: false
        });

        this._title = new Gtk.Label({
            label: `<b>${title}</b>`,
            use_markup: true,
            xalign: 0
        });
    }

    get title_label(): any {
        return this._title;
    }
});

/**
 * Frame ListBox allows keyboard navigation on the configuration items.
 * Also, allows for dynamically showing settings at runtime.
 */
var PopShellFrameListBox = GObject.registerClass(class PopShell_FrameListBox extends Gtk.Frame {

    private _list_box: any;
    count: number = 0;

    _init() {
        super._init({ label_yalign: 0.50 });
        this._list_box = new Gtk.ListBox();
        this.count = 0;
        this._list_box.set_selection_mode(Gtk.SelectionMode.NONE);
        Gtk.Frame.prototype.add.call(this, this._list_box);
    }

    add(box_row: any) {
        this._list_box.add(box_row);
        this.count++;
    }

    show() {
        this._list_box.show_all();
    }
});

var PopShellListBoxRow = GObject.registerClass(class PopShell_ListBoxRow extends Gtk.ListBoxRow {

    private _grid: any;

    _init(params: any) {
        super._init(params);
        this.selectable = false;
        this.activatable = false;
        this._grid = new Gtk.Grid({
            margin_top: 5,
            margin_bottom: 5,
            margin_left: 10,
            margin_right: 10,
            column_spacing: 20,
            row_spacing: 20
        });
        Gtk.ListBoxRow.prototype.add.call(this, this._grid);
    }

    get grid() {
        return this._grid;
    }

    add(widget: any) {
        this._grid.add(widget);
    }
});

var PopShellMainSettingsPanel = GObject.registerClass(class PopShell_MainSettingsPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Main');
        this._settings = settings;

        // Pop!_Shell Profiles
        // TODO, expand to $HOME/.config/pop-shell/profiles.json..
        let profile_header_label = new Gtk.Label({
            label: `<b>Profiles (TODO)</b>`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        this.add(profile_header_label);

        let profile_frame = new PopShellFrameListBox();
        
        let profile_row = new PopShellListBoxRow();
        let profile_default_label = new Gtk.Label({
            label: `Pop!_Shell Default`,
            xalign: 0,
            hexpand: true
        });

        profile_row.add(profile_default_label);
        profile_frame.add(profile_row);
        profile_frame.show();

        this.add(profile_frame);

        // Import and Export Settings
        let import_export_header_label = new Gtk.Label({
            label: `<b>Import &amp; Export Settings (TODO)</b>`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        this.add(import_export_header_label);

        let import_export_frame = new PopShellFrameListBox();

        let import_setting_row = new PopShellListBoxRow();
        let import_label = new Gtk.Label({
            label: `Import`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        import_setting_row.add(import_label);
        import_export_frame.add(import_setting_row);

        let export_setting_row = new PopShellListBoxRow();
        let export_label = new Gtk.Label({
            label: `Export`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        export_setting_row.add(export_label);
        import_export_frame.add(export_setting_row);

        import_export_frame.show();

        this.add(import_export_frame);
    }
});

var PopShellTilingPanel = GObject.registerClass(class PopShell_TilingPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Tiling');
        this._settings = settings;

        let tiling_options_frame = new PopShellFrameListBox();

        let gaps_header_label = new Gtk.Label({
            label: `<b>Gap Options</b>`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        this.add(gaps_header_label);

        // Smart Gaps
        let smart_gaps_row = new PopShellListBoxRow();
        let smart_gap_label = new Gtk.Label({
            label: `Smart Gaps`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        let smart_gap_switch = new Gtk.Switch({ halign: Gtk.Align.START });
        smart_gap_switch.set_active(this._settings.smart_gaps());
        smart_gap_switch.connect('state-set', (_widget: any, state: boolean) => {
            this._settings.set_smart_gaps(state);
            Settings.sync();
        })

        smart_gaps_row.add(smart_gap_label);
        smart_gaps_row.add(smart_gap_switch);

        tiling_options_frame.add(smart_gaps_row);

        // Tiling Gap Sizes

        // TODO: change the gap size options to Gtk.SpinnerButton and combine, 
        // Rarely and probably, user would not need them to be separate

        // Outer
        let gap_size_outer_row = new PopShellListBoxRow();
        let gap_size_outer_label = new Gtk.Label({
            label: `Outer Size`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        let gap_size_outer_text = new Gtk.Entry({ input_purpose: Gtk.InputPurpose.NUMBER });
        gap_size_outer_text.set_text(String(this._settings.gap_outer()));
        gap_size_outer_text.connect('activate', (widget: any) => {
            let parsed = parseInt((widget.get_text() as string).trim());
            if (!isNaN(parsed)) {
                this._settings.set_gap_outer(parsed);
                Settings.sync();
            };
        });

        gap_size_outer_row.add(gap_size_outer_label);
        gap_size_outer_row.add(gap_size_outer_text);

        tiling_options_frame.add(gap_size_outer_row);

        // Inner
        let gap_size_inner_row = new PopShellListBoxRow();
        let gap_size_inner_label = new Gtk.Label({
            label: `Inner Size`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        let gap_size_inner_text = new Gtk.Entry({ input_purpose: Gtk.InputPurpose.NUMBER });
        gap_size_inner_text.set_text(String(this._settings.gap_outer()));
        gap_size_inner_text.connect('activate', (widget: any) => {
            let parsed = parseInt((widget.get_text() as string).trim());
            if (!isNaN(parsed)) {
                this._settings.set_gap_outer(parsed);
                Settings.sync();
            };
        });

        gap_size_inner_row.add(gap_size_inner_label);
        gap_size_inner_row.add(gap_size_inner_text);

        tiling_options_frame.add(gap_size_inner_row);
        tiling_options_frame.show();
        this.add(tiling_options_frame);

        let windows_header_label = new Gtk.Label({
            label: `<b>Window Options</b>`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        this.add(windows_header_label);

        let window_options_frame = new PopShellFrameListBox();

        // Window Animations
        let window_animation_row = new PopShellListBoxRow();
        let window_animation_label = new Gtk.Label({
            label: `Show Window Animations (TODO)`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        window_animation_row.add(window_animation_label);
        // TODO add animation switch

        window_options_frame.add(window_animation_row);
        window_options_frame.show();
        this.add(window_options_frame);
    }
});

var PopShellFloatingPanel = GObject.registerClass(class PopShell_FloatingPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Floating');
        this._settings = settings;

        let floating_options_frame = new PopShellFrameListBox();

        // Snap to Grid
        let snap_to_grid_row = new PopShellListBoxRow();
        let snap_to_grid_label = new Gtk.Label({
            label: `Snap to Grid`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        let snap_to_grid_switch = new Gtk.Switch({ halign: Gtk.Align.START });
        snap_to_grid_switch.set_active(this._settings.snap_to_grid());
        snap_to_grid_switch.connect('state-set', (_widget: any, state: boolean) => {
            this._settings.set_snap_to_grid(state);
            Settings.sync();
        })

        snap_to_grid_row.add(snap_to_grid_label);
        snap_to_grid_row.add(snap_to_grid_switch);

        floating_options_frame.add(snap_to_grid_row);

        floating_options_frame.show();
        this.add(floating_options_frame);
    }
});

var PopShellWindowsPanel = GObject.registerClass(class PopShell_WindowsPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Windows');
        this._settings = settings;

        let window_options_frame = new PopShellFrameListBox();

        // Window Titles
        let window_title_row = new PopShellListBoxRow();
        let window_title_label = new Gtk.Label({
            label: `Show Window Titles`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        let window_title_switch = new Gtk.Switch({ halign: Gtk.Align.START });
        window_title_switch.set_active(this._settings.show_title());
        window_title_switch.connect('state-set', (_widget: any, state: boolean) => {
            this._settings.set_show_title(state);
            Settings.sync();
        })

        window_title_row.add(window_title_label);
        window_title_row.add(window_title_switch);

        window_options_frame.add(window_title_row);

        window_options_frame.show();
        this.add(window_options_frame);
    }
});

var PopShellDevelopmentPanel = GObject.registerClass(class PopShell_DevelopmentPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Windows');
        this._settings = settings;

        let develop_tools_frame = new PopShellFrameListBox();

        // Logging Level
        let logging_level_row = new PopShellListBoxRow();
        let logging_level_label = new Gtk.Label({
            label: `Logging Level`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });
        let logging_combo = new Gtk.ComboBoxText();

        for (const key in logger.LOG_LEVELS) {
            // since log level loop will contain key and level,
            // then cherry-pick the number, key will be the text value
            if (typeof logger.LOG_LEVELS[key] === 'number') {
                logging_combo.append(`${logger.LOG_LEVELS[key]}`, key);
            }
        }

        let current_log_level = logger.log_level();

        logging_combo.set_active_id(`${current_log_level}`);
        logging_combo.connect("changed", () => {
            let active_id = logging_combo.get_active_id();

            let settings = ExtensionUtils.getSettings();
            settings.set_uint('log-level', active_id);
        });

        logging_level_row.add(logging_level_label);
        logging_level_row.add(logging_combo);

        develop_tools_frame.add(logging_level_row);

        develop_tools_frame.show();
        this.add(develop_tools_frame);
    }
});

var PopShellActiveHintPanel = GObject.registerClass(class PopShell_ActiveHintPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Active Hint');
        this._settings = settings;

        // Window Active Hint
        let window_hint_header_label = new Gtk.Label({
            label: `<b>Window Hint</b>`,
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        this.add(window_hint_header_label);

        let window_hint_frame = new PopShellFrameListBox();

        // Hint Border Thickness
        let window_thickness_row = new PopShellListBoxRow();
        let window_thickness_label = new Gtk.Label({
            label: `Thickness`,
            xalign: 0,
            hexpand: true
        });

        let hint_size_spin_button = Gtk.SpinButton.new_with_range(3, 8, 1);
        hint_size_spin_button.max_width_chars = 1
        hint_size_spin_button.max_length = 1
        hint_size_spin_button.width_chars = 2
        hint_size_spin_button.xalign = 1
        hint_size_spin_button.value = this._settings.hint_size();

        hint_size_spin_button.connect('value-changed', (self: any) => {
            this._settings.set_hint_size(parseInt(self.value));
        });

        this._settings.ext.connect('changed', (_, key) => {
            if (key === 'hint-size') {
                hint_size_spin_button.value = this._settings.hint_size();
            }
            return false;
        });

        window_thickness_row.add(window_thickness_label);
        window_thickness_row.add(hint_size_spin_button);

        window_hint_frame.add(window_thickness_row);

        // Hint Color
        let window_color_row = new PopShellListBoxRow();
        let window_color_label = new Gtk.Label({
            label: `Color`,
            xalign: 0,
            hexpand: true
        });

        let window_palette_button = new Gtk.RadioButton({
            label: `Palette`,
            halign: Gtk.Align.END,
            draw_indicator: false
        });

        let window_editor_button = new Gtk.RadioButton({
            label: `Editor`,
            group: window_palette_button,
            halign: Gtk.Align.END,
            draw_indicator: false
        });

        let window_apply_button = new Gtk.Button({
            label: `Apply`,
            halign: Gtk.Align.END
        });

        window_palette_button.connect('toggled', () => {
            window_hint_chooser.show_editor = !window_palette_button.get_active();
            this._update_hint_color(window_hint_chooser);
        });

        window_editor_button.connect('toggled', () => {
            window_hint_chooser.show_editor = window_editor_button.get_active();
            this._update_hint_color(window_hint_chooser);
        });

        window_apply_button.connect('clicked', () => {
            this._settings.set_hint_color_rgba(window_hint_chooser.get_rgba().to_string());
        });

        let window_hint_chooser = new Gtk.ColorChooserWidget({
            halign: Gtk.Align.CENTER,
            margin_top: 10,
            margin_bottom: 10
        });

        this._update_hint_color(window_hint_chooser);

        // TODO figure out how to connect the custom (+) color button so the radio buttons can be toggled
        window_hint_chooser.connect('color-activated', (self: any) => {
            this._settings.set_hint_color_rgba(self.get_rgba().to_string());
        });

        window_color_row.add(window_color_label);
        window_color_row.add(window_palette_button);
        window_color_row.add(window_editor_button);
        window_color_row.add(window_apply_button);

        window_hint_frame.add(window_color_row);
        window_hint_frame.add(window_hint_chooser);

        this.add(window_hint_frame);
    }

    private _update_hint_color(color_chooser: any) {
        const DEFAULT_HINT_COLOR = 'rgba(251, 184, 108, 1)'; //pop-orange

        let rgba = new Gdk.RGBA();
        if (!rgba.parse(this._settings.hint_color_rgba())) {
            rgba.parse(DEFAULT_HINT_COLOR);
        }

        color_chooser.set_rgba(rgba);
    }
});

var PopShellUnderConstructionPanel = GObject.registerClass(class PopShell_UnderConstructionPanel extends PopShellPanel {

    // @ts-ignore
    private _settings: settings.ExtensionSettings;

    /**
     * 
     * @param settings - gschema settings
     */
    _init(settings: settings.ExtensionSettings) {
        super._init('Under Construction');
        this._settings = settings;

        let logo_path = `${Me.path}/icons/prefs/pop-os-logo-symbolic.svg`;
        let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(logo_path, 100, 100);
        let logo_image = new Gtk.Image({
            pixbuf: pixbuf,
            margin_bottom: 5
        });

        let under_construction_label = new Gtk.Label({
            label: `Work in Progress`,
            hexpand: true
        });
        under_construction_label.set_justify(Gtk.Justification.CENTER);

        let vertical_box = new Gtk.VBox({
            margin_top: 100,
            margin_bottom: 0,
            expand: false
        });

        vertical_box.add(logo_image);

        this.add(vertical_box);
        this.add(under_construction_label);
    }
});