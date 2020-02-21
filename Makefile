# Retrieve the UUID from ``metadata.json``
UUID = $(shell grep -E '^[ ]*"uuid":' ./metadata.json | sed 's@^[ ]*"uuid":[ ]*"\(.\+\)",[ ]*@\1@')

ifeq ($(strip $(DESTDIR)),)
INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
INSTALLBASE = $(DESTDIR)/usr/share/gnome-shell/extensions
endif
INSTALLNAME = $(UUID)

$(info UUID is "$(UUID)")

.PHONY: all clean install zip-file

sources = src/extension.js \
	src/auto_tiler.js \
	src/ecs.js \
	src/focus.js \
	src/geom.js \
	src/grab_op.js \
	src/keybindings.js \
	src/lib.js \
	src/panel_settings.js \
	src/search.js \
	src/settings.js \
	src/tags.js \
	src/tiling.js \
	src/window.js \
	src/window_search.js \
	src/shortcut_overlay.js \
	stylesheet.css

all: $(sources) metadata.json schemas
	rm -rf _build
	mkdir -p _build
	cp -r $^ _build

schemas: schemas/gschemas.compiled
	touch $@

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas

clean:
	rm -rf _build schemas/gschemas.compiled

install: all
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME)
	cp -r _build/* $(INSTALLBASE)/$(INSTALLNAME)/

uninstall:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)

zip-file: all
	cd _build && zip -qr "../$(UUID)$(VSTRING).zip" .
