const Me = imports.misc.extensionUtils.getCurrentExtension();

const Focus = Me.imports.focus;
const { Meta } = imports.gi;

var Swapper = class Swapper {
	constructor(ext) {
		this.ext = ext;
	}

	swap(direction) {
        let workspace = global.workspace_manager.get_active_workspace();
        let window_list = this.ext.tab_list(Meta.TabList.NORMAL, workspace);
        let focused = this.ext.focus_window();
        Focus.focus(direction, (win) => focused.swap(win), focused, window_list);
    }

    above() {
        this.swap(Focus.window_up);
    }

    below() {
        this.swap(Focus.window_down);
    }

    left() {
        this.swap(Focus.window_left);
    }

    right() {
        this.swap(Focus.window_right);
    }
}
