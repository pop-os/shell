# Retrieve the UUID from ``metadata.json``
UUID = $(shell grep -E '^[ ]*"uuid":' ./metadata.json | sed 's@^[ ]*"uuid":[ ]*"\(.\+\)",[ ]*@\1@')
VERSION = $(shell grep version tsconfig.json | awk -F\" '{print $$4}')

ifeq ($(XDG_DATA_HOME),)
XDG_DATA_HOME = $(HOME)/.local/share
endif

ifeq ($(strip $(DESTDIR)),)
INSTALLBASE = $(XDG_DATA_HOME)/gnome-shell/extensions
PLUGIN_BASE = $(XDG_DATA_HOME)/pop-shell/launcher
SCRIPTS_BASE = $(XDG_DATA_HOME)/pop-shell/scripts
else
INSTALLBASE = $(DESTDIR)/usr/share/gnome-shell/extensions
PLUGIN_BASE = $(DESTDIR)/usr/lib/pop-shell/launcher
SCRIPTS_BASE = $(DESTDIR)/usr/lib/pop-shell/scripts
endif
INSTALLNAME = $(UUID)

PROJECTS = color_dialog floating_exceptions

$(info UUID is "$(UUID)")

.PHONY: all clean install zip-file

sources = src/*.ts *.css

all: depcheck compile

clean:
	rm -rf _build target

# Configure local settings on system
configure:
	sh scripts/configure.sh

compile: $(sources) clean
	env PROJECTS="$(PROJECTS)" ./scripts/transpile.sh

# Rebuild, install, reconfigure local settings, restart shell, and listen to journalctl logs
debug: depcheck compile install install-system76-plugins configure enable restart-shell listen

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

local-install: depcheck compile install install-system76-plugins configure enable restart-shell

install:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME) $(PLUGIN_BASE) $(SCRIPTS_BASE)
	cp -r _build/* $(INSTALLBASE)/$(INSTALLNAME)/
	cp -r src/plugins/* $(PLUGIN_BASE)
	cp -r src/scripts/* $(SCRIPTS_BASE)
	chmod +x $(PLUGIN_BASE)/**/*.js $(SCRIPTS_BASE)/*

install-system76-plugins:
	mkdir -p $(SCRIPTS_BASE)
	cp -r src/scripts_system76/* $(SCRIPTS_BASE)
	chmod +x $(SCRIPTS_BASE)/*

uninstall:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)

restart-shell:
	echo "Restart shell!"
	if bash -c 'xprop -root &> /dev/null'; then \
		busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting Gnome...")'; \
	else \
		gnome-session-quit --logout; \
	fi
	sleep 3

update-repository:
	git fetch origin
	git reset --hard origin/master
	git clean -fd

zip-file: all
	cd _build && zip -qr "../$(UUID)_$(VERSION).zip" .
