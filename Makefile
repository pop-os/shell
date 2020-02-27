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

sources = src/*.ts stylesheet.css

all: depcheck compile

compile: $(sources) metadata.json schemas
	tsc
	for file in target/*.js; do \
		sed -i \
			-e 's#export function#function#g' \
			-e 's#export var#var#g' \
			-e 's#Object.defineProperty(exports, "__esModule", { value: true });#var exports = {};#g' \
			$$file; \
		sed -i -E 's/export class (\w+)/var \1 = class \1/g' $$file; \
		sed -i -E "s/import \* as (\w+) from '(\w+)'/const \1 = Me.imports.\2/g" $$file; \
	done
	rm -rf _build
	mkdir -p _build
	cp -r metadata.json schemas target/*.js imports/*.js stylesheet.css _build

depcheck:
	if ! command -v tsc >/dev/null; then \
		echo 'You must install TypeScript to compile: (node-typescript on Debian systems)'; \
		exit 1; \
	fi

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
