// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Lib from 'lib';

const { Clutter, St } = imports.gi;
const { ModalDialog } = imports.ui.modalDialog;

export class AddExceptionDialog {
    dialog: Shell.ModalDialog = new ModalDialog({
        styleClass: "pop-shell-search modal-dialog",
        destroyOnClose: false,
        shellReactive: true,
        shouldFadeIn: false,
        shouldFadeOut: false
    });

    constructor(cancel: () => void, this_app: () => void, current_window: () => void) {
        let title = St.Label.new("Add Floating Window Exception");
        title.set_x_align(Clutter.ActorAlign.CENTER)
        title.set_style("font-weight: bold")

        let desc = St.Label.new("Float the selected window or all windows from the application.");
        desc.set_x_align(Clutter.ActorAlign.CENTER)

        let l = this.dialog.contentLayout;

        l.add(title)
        l.add(desc)

        this.dialog.contentLayout.width = Math.max(Lib.current_monitor().width / 4, 640);

        this.dialog.addButton({
            label: "Cancel",
            action: () => {
                cancel();
                this.close();
            },
            key: Clutter.KEY_Escape
        });

        this.dialog.addButton({
            label: "This App's Windows",
            action: () => {
                this_app();
                this.close();
            },
        });

        this.dialog.addButton({
            label: "Current Window Only",
            action: () => {
                current_window();
                this.close();
            }
        })
    }

    close() {
        this.dialog.close(global.get_current_time());
    }

    show() {
        this.dialog.show_all();
    }

    open() {
        this.dialog.open(global.get_current_time(), false);
        this.show();
    }
}