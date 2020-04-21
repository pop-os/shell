# Testing

This document provides a guideline for testing and verifying the expected behaviors of the project. When a patch is ready for testing, the checklists may be copied and marked as they are proven to be working.

## Logs

To begin watching logs, open a terminal with the following command:

```
journalctl -o cat -n 0 -f "$(which gnome-shell)" | grep -v warning
```

Note that because the logs are from GNOME Shell, there will be messages from all installed extensions, and GNOME Shell itself. Pop Shell is fairly chatty though, so the majority of the logs should be from Pop Shell. Pop Shell logs are usually prepended with `pop-shell:`, but sometimes GNOME has internal errors and warnings surrounding those logs that could be useful for pointing to an issue that we can resolve in Pop Shell.

## Checklists

Tasks for a tester to verify when approving a patch

### Workspaces

- [ ] Tiled windows move across workspaces
- [ ] Floating windows move across workspaces
- [ ] Windows can be moved with the mouse and keyboard
- [ ] Windows correctly move workspaces when a workspace is destroyed

### Displays

- [ ] Unplugging and plugging in displays re-tiles all workspaces correctly
- [ ] Primary display changes are working correctly
- [ ] Windows correctly move across workspaces after display changes

### Tiling

- [ ] Windows can be rearranged with the mouse and keyboard
- [ ] Windows can be swapped with the mouse and keyboard
- [ ] Try all forms of resizing a fork with the mouse and keyboard
- [ ] Minimizing a window should detach it from the tree
- [ ] Fullscreening, unfullscreening, maximizing, and unmaximizing are all working
- [ ] Restarting the extension; or toggling auto-tile; correctly handles minimized, maximized, fullscreen, floating, and non-floating windows

### Launcher

- [ ] Windows should appear on launch
- [ ] Typing text and then removing it will re-show those windows
- [ ] Search works for applications and windows
- [ ] The overlay hint correctly highlights the selected window
