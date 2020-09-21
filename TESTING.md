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
- [ ] Unminimizing a window re-tiles the window
- [ ] Maximizing with the keyboard (`Super` `M`) covers tiled windows
- [ ] Unmaximizing with keyboard (`Super` `M`) re-tiles into place
- [ ] Maximizing with the mouse covers tiled windows
- [ ] Unmaximizing with mouse re-tiles into place
- [ ] Full-screening removes the active hint and full-screens on one display 
- [ ] Unfull-screening adds the active hint and re-tiles into place
- [ ] Maximizing a YouTube video fills the screen and unmaximizing retiles the browser in place
- [ ] VIM shortcuts work as direction keys
- [ ] `Super` `O` changes window orientation
- [ ] `Super` `G` floats and then re-tiles a window
- [ ] Float a window with `Super` `G`. It should be movable and resizeable in window management mode with keyboard keys
- [ ] `Super` `Q` Closes a window
- [ ] Turn off auto-tiling. New windows launch floating.
- [ ] Turn on auto-tiling. Windows automatically tile.
- [ ] Disabling and enabling auto-tiling correctly handles minimized, maximized, fullscreen, floating, and non-floating windows (This test needs a better definition, steps, or to be separated out.)

### Stacking
- [ ] Windows can be moved into a stack.
- [ ] Windows can be moved out of a stack.
- [ ] Windows inside and outside of a stack can be swapped multiple times and in both directions.
- [ ] Moving the last window out of a stack works as expected.
- [ ] Stacks can be resized with the keyboard.
- [ ] Stacks can be resized with the mouse.

### Workspaces

- [ ] Windows can be moved to another workspace with the keyboard
- [ ] Windows can be moved to another workspace with the mouse
- [ ] Windows can be moved to workspaces between existing workspaces
- [ ] Moving windows to another workspace re-tiled the previous and new workspace
- [ ] Active hint is present on the new workspace and once the window is returned to its previous workspace
- [ ] Floating windows move across workspaces
- [ ] Remove windows from the 2nd worspace in a 3 workspace setup. The 3rd workspace becomes the 2nd workspace, and tiling is unaffected by the move.

### Displays

- [ ] Windows move across displays in adjustment mode with direction keys
- [ ] Windows move across displays with the mouse
- [ ] Changing the primary display moves the top bar. Window heights adjust on all monitors for the new position.
- [ ] Unplug a display - windows from the display retile on a new workspace on the remaining display
- [ ] NOTE: Add vertical monitor layout test

### Launcher

- [ ] All windows on all workspaces appear on launch
- [ ] Choosing an app on another workspace moves workspaces and focus to that app
- [ ] Launching an application works
- [ ] Typing text and then removing it will re-show those windows
- [ ] Search works for applications and windows
- [ ] Search works for GNOME settings panels
- [ ] Search for "Extensions". There should be only one entry.
- [ ] The overlay hint correctly highlights the selected window
- [ ] t: executes a command in a terminal
- [ ] : executes a command in sh
- [ ] = calculates an equation

### Window Titles

- [ ] Disabling window titles using global (Pop Shell) option works for Shell Shortcuts, LibreOffice, etc.
- [ ] Disabling window titles in Firefox works (Check debian and flatpak packages)

## With Tiling Disabled

### Tiling

- [ ] Super direction keys changes focus in the correct direction
- [ ] Windows can be moved with the keyboard
- [ ] Windows can be moved with the mouse
- [ ] Windows swap with the keyboard (test with different size windows)
- [ ] Windows can be resized with the keyboard
- [ ] Windows can be resized with the mouse
- [ ] Windows can be half-tiled left and right with `Ctrl``Super``left`/`right`

### Displays

- [ ] Windows move across displays in adjustment mode with directions keys
- [ ] Windows move across displays with the mouse

## Miscellaneous

- [ ] Close all windows-- no icons should be active in the GNOME launcher.

## Enhancement Tests

Enhancement test don't have to pass for release. Once an enhancement test passes, move up to the standard required-pass test for release.

- [ ] Plug an additional display into a laptop - windows and workspaces don't change
