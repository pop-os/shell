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

sources = src/*.ts *.css

all: depcheck compile

clean:
	rm -rf _build schemas/gschemas.compiled target

transpile: $(sources) clean
	tsc

# Configure local settings on system
configure:
	sh scripts/configure.sh

compile: convert metadata.json schemas
	rm -rf _build
	mkdir -p _build
	cp -r metadata.json icons schemas target/*.js imports/*.js *.css src/gtk/*.js _build

convert: transpile
	sh scripts/transpile.sh

# Rebuild, install, reconfigure local settings, restart shell, and listen to journalctl logs
debug: install configure enable restart-shell listen

depcheck:
	@echo depcheck
	@if ! command -v tsc >/dev/null; then \
		echo \
		echo 'You must install TypeScript >= 3.8 to transpile: (node-typescript on Debian systems)'; \
		exit 1; \
	fi

enable:
	gnome-extensions enable "pop-shell@system76.com"

disable:
	gnome-extensions disable "pop-shell@system76.com"

listen:
	journalctl -o cat -n 0 -f "$$(which gnome-shell)" | grep -v warning

local-install: install configure enable restart-shell

install:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME)
	cp -r _build/* $(INSTALLBASE)/$(INSTALLNAME)/

uninstall:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)

restart-shell:
	echo "Restart shell!"
	if bash -c 'xprop -root &> /dev/null'; then \
		busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting Gnome...")'; \
	else \
		gnome-session-quit --logout; \
	fi

update-repository:
	git fetch origin
	git reset --hard origin/master_focal
	git clean -fd

schemas: schemas/gschemas.compiled
	touch $@

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas

zip-file: all
	cd _build && zip -qr "../$(UUID)$(VSTRING).zip" .
