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
  - mostly works but has bug: https://github.com/pop-os/shell/issues/307
- [ ] Windows can be resized with the keyboard (Test resizing four windows above, below, right, and left to ensure shortcut consistency)
- [ ] Windows can be resized with the mouse
- [ ] Minimizing a window detaches it from the tree and re-tiles remaining windows
- [ ] Unminimizing a window re-tiles it into its previous location
- [ ] Maximizing removes the active hint and covers tiled windows
- [ ] Umaximizing adds active hint and re-tiles into place
- [ ] Full-screening removes the hint and full-screens on one display 
  - Not required, currently has a bug: https://github.com/pop-os/shell/issues/222
- [ ] Unfull-screening adds active hint and re-tiles into place (Not required, currently has a bug)
- [ ] Maximizing a YouTube video fills the screen and unmaximizing retiles the browser in place
  - fullscreen bug is present here too
- [ ] VIM shortcuts work as direction keys
- [ ] `Super` `O` changes window orientation
- [ ] `Super` `G` floats and then re-tiles a window
- [ ] `Super` `Q` Closes a window
- [ ] `Super` `M` Maximizes and un-maximizes a window
- [ ] Turn off auto-tiling. New windows launch floating.
- [ ] Turn on auto-tiling. Windows automatically tile.
- [ ] Disabling and enabling auto-tiling correctly handles minimized, maximized, fullscreen, floating, and non-floating windows
- [ ] Float a window with `Super` `G`. It should be movable and resizeable in window management mode with keyboard keys
  - Not required, currently has a bug: https://github.com/pop-os/shell/issues/155

### Workspaces

- [ ] Windows can be moved to another workspace with the keyboard
- [ ] Windows can be moved to another workspace with the mouse
- [ ] Windows can be moved to workspaces between existing workspaces
  - Works except when moving to a new workspace at the very beginning of the stack. 
- [ ] Moving windows to another workspace re-tiled the previous and new workspace
- [ ] Active hint is present on the new workspace and once the window is returned to its previous workspace
  - Broke, but commit is made that should fix it: https://github.com/pop-os/shell/pull/300/commits/255c01d11c6f4f327e93137b310201ee42351635
- [ ] Floating windows move across workspaces
- [ ] Remove windows from the 2nd worspace in a 3 workspace setup. The 3rd workspace becomes the 2nd workspace, and tiling is unaffected by the move.

### Displays

- [ ] Windows move across displays in adjustment mode with direction keys
- [ ] Windows move across displays with the mouse
- [ ] Changing the primary display moves the top bar. Window heights adjust on all monitors for the new position.
- [ ] Unplug a display - windows from the display retile on a new workspace on the remaining display
- [ ] Plug in a display - windows and workspaces don't change
  - Still buggy: https://github.com/pop-os/shell/issues/171
- [ ] NOTE: Add vertical monitor layout test

### Launcher

- [ ] All windows on all workspaces appear on launch
- [ ] Choosing an app on another workspace moves workspaces and focus to that app
- [ ] Launching an application works
- [ ] Typing text and then removing it will re-show those windows
- [ ] Search works for applications and windows
- [ ] The overlay hint correctly highlights the selected window
- [ ] t: executes a command in a terminal
- [ ] : executes a command in sh
- [ ] = calculates an equation

### Window Titles

- [ ] Disabling window titles in Firefox works (Check debian and flatpak packages)
  - This may make firefox windows move around randomly when toggled, and you may have to restart firefox for it to work properly, but it should work besides that.

## With Tiling Disabled

### Tiling

- [ ] Super direction keys changes focus in the correct direction
- [ ] Windows can be moved with the keyboard
- [ ] Windows can be moved with the mouse
- [ ] Windows swap with the keyboard (test with different size windows)
- [ ] Windows can be resized with the keyboard (Test resizing four windows above, below, right, and left to ensure shortcut consistency)
- [ ] Windows can be resized with the mouse
- [ ] Windows can be half-tiled left and right with `Ctrl``Super``left`/`right`

### Displays

- [ ] Windows move across displays in adjustment mode with directions keys
  - In floating mode, this works unless the windows have to cross the top bar. Bug: https://github.com/pop-os/shell/issues/184
- [ ] Windows move across displays with the mouse
