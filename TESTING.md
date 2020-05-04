# Testing

This document provides a guideline for testing and verifying the expected behaviors of the project. When a patch is ready for testing, the checklists may be copied and marked as they are proven to be working.

## Logs

To begin watching logs, open a terminal with the following command:

```
journalctl -o cat -n 0 -f "$(which gnome-shell)" | grep -v warning
```

Note that because the logs are from GNOME Shell, there will be messages from all installed extensions, and GNOME Shell itself. Pop Shell is fairly chatty though, so the majority of the logs should be from Pop Shell. Pop Shell logs are usually prepended with `pop-shell:`, but sometimes GNOME has internal errors and warnings surrounding those logs that could be useful for pointing to an issue that we can resolve in Pop Shell.

## Checklists

Tasks for a tester to verify when approving a patch. Use complex window layouts and at least two displays. Turn on active hint during testing.

## With tiling enabled

### Tiling

- [ ] Super direction keys changes focus in the correct direction
- [ ] Windows moved with the keyboard tile into place
- [ ] Windows moved with the mouse tile into place
- [ ] Windows swap with the keyboard (test with different size windows)
- [ ] Windows can be resized with the keyboard (Test resizing four windows above, below, right, and left to ensure shortcut consistency)
- [ ] Windows can be resized with the mouse
- [ ] Minimizing a window detaches it from the tree and re-tiles remaining windows
- [ ] Unminimizing a window re-tiles it into it's previous location
- [ ] Maximizing removes the active hint and covers tiled windows
- [ ] Umaximizing adds active hint and re-tiles into place
- [ ] Full-screening removes the hint and full-screens on one display (Not required, currently has a bug)
- [ ] Unfull-screening adds active hint and re-tiles into place (Not required, currently has a bug)
- [ ] Maximizing a YouTube fills the screen and unmaximizing retiles the browser in place
- [ ] VIM shortcuts work as direction keys
- [ ] `Super` `O` changes window orientation
- [ ] `Super` `G` floats and then re-tiles a window
- [ ] `Super` `Q` Closes a window
- [ ] `Super` `M` Maximizes and un-maximizes a window
- [ ] Turn off auto-tiling. New windows launch floating.
- [ ] Turn on auto-tiling. Windows automatically tile.
- [ ] Disabling and enabling auto-tiling correctly handles minimized, maximized, fullscreen, floating, and non-floating windows

### Workspaces

- [ ] Windows can be moved to another workspace with the keyboard
- [ ] Windows can be moved to another workspace with the mouse
- [ ] Windows can be moved to workspaces between existing workspaces
- [ ] Moving windows to another workspace re-tiled the previous and new workspace
- [ ] Active hint is present on the new workspace and once the window is returned to its previous workspace
- [ ] Floating windows move across workspaces
- [ ] Windows correctly move workspaces when a workspace is destroyed

### Displays

- [ ] Windows move across displays in adjustment mode with directions keys
- [ ] Windows move across displays with the mouse
- [ ] Changing the primary display moves the top bar. Window heights adjust on all monitors for the new position.
- [ ] Unplugging and plugging in displays re-tiles all workspaces correctly
- [ ] Windows correctly move across workspaces after display changes
- [ ] NOTE: Add vertical monitor layout test

### Launcher

- [ ] All windows on all workspaces appear on launch
- [ ] Choosing an app on another workspace moves workspaces and focus to that app
- [ ] Launching an application works
- [ ] Typing text and then removing it will re-show those windows
- [ ] Search works for applications and windows
- [ ] The overlay hint correctly highlights the selected window
- [ ] t: executes a command in a terminal
- [ ] : executes a commang in sh
- [ ] = calculates and equation

## With Tiling Disabled

### Tiling

- [ ] Super direction keys changes focus in the correct direction
- [ ] Windows can be moved with the keyboard
- [ ] Windows can be moved with the mouse
- [ ] Windows swap with the keyboard (test with different size windows)
- [ ] Windows can be resized with the keyboard (Test resizing four windows above, below, right, and left to ensure shortcut consistency)
- [ ] Windows can be resized with the mouse

### Displays

- [ ] Windows move across displays in adjustment mode with directions keys
- [ ] Windows move across displays with the mouse
