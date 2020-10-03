#!/usr/bin/env bash

. scripts/common.sh

confirm_shortcut

set -xe

# Build and install extension
make all
make install

set_keybindings
enable_other_extensions

# Enable extension
make enable
make restart-shell

set +x

echo ""
echo "Done installation. Enjoy Pop Shell!"
