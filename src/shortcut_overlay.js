const Me = imports.misc.extensionUtils.getCurrentExtension();

const { GObject, St } = imports.gi;

const { join, separator } = Me.imports.lib;

var Shortcut = class Shortcut {
    constructor(description) {
        this.description = description;
        this.bindings = new Array();
    }

    add(binding) {
        this.bindings.push(binding);
        return this;
    }
}

var Section = class Section {
    constructor(header, shortcuts) {
        this.header = header;
        this.shortcuts = shortcuts;
    }
}

var Column = class Column {
    constructor(sections) {
        this.sections = sections;
    }
}

var ShortcutOverlay = GObject.registerClass(
    class ShortcutOverlay extends St.BoxLayout {
        _init(title, columns) {
            super.init({
                styleClass: 'pop-shell-shortcuts',
                destroyOnClose: false,
                shellReactive: true,
                shouldFadeIn: true,
                shouldFadeOut: true,
            });

            let columns_layout = new St.BoxLayout({
                styleClass: 'pop-shell-shortcuts-columns',
                horizontal: true
            });

            for (const column of columns) {
                let column_layout = new St.BoxLayout({
                    styleClass: 'pop-shell-shortcuts-column',
                });

                for (const section of column) {
                    column_layout.add(this.gen_section(section));
                }

                columns_layout.add(column_layout);
            }

            this.add(new St.Label({
                styleClass: 'pop-shell-shortcuts-title',
                text: title
            }));

            this.add(columns_layout);

            // TODO: Add hyperlink for shortcuts in settings
        }

        gen_combination(combination) {
            let layout = new St.BoxLayout({
                styleClass: 'pop-shell-binding',
                horizontal: true
            });

            for (const key of combination) {
                layout.add(St.Label({ text: key }));
            }

            return layout;
        }

        gen_section(section) {
            let layout = new St.BoxLayout({
                styleclass: 'pop-shell-section',
            });

            layout.add(new St.Label({
                styleClass: 'pop-shell-section-header',
                text: section.description
            }));

            for (const subsection of section) {
                for (const shortcut of subsection) {
                    layout.add(separator());
                    layout.add(gen_shortcut(shortcut));
                }
            }

            return layout;
        }

        gen_shortcut(shortcut) {
            let layout = new St.BoxLayout({
                styleClass: 'pop-shell-shortcut',
                horizontal: true
            });

            layout.add(new St.Label({
                text: shortcut.description
            }));

            for (const binding of shortcut.bindings) {
                join(
                    binding,
                    (comb) => layout.add(this.gen_combination(comb)),
                    () => layout.add(new St.Label({ text: 'or' }))
                );
            }

            return layout;
        }
    }
)
