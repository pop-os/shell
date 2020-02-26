# Build and install extension
make all
make install

left="h"
down="j"
up="k"
right="l"

KEYS_GNOME_WM=/org/gnome/desktop/wm/keybindings
KEYS_GNOME_SHELL=/org/gnome/shell/keybindings
KEYS_MEDIA=/org/gnome/settings-daemon/plugins/media-keys

# Disable incompatible shortcuts
# Restore the keyboard shortcuts: disable <Super>Escape
dconf write /org/gnome/mutter/wayland/keybindings/restore-shortcuts "@as []"
# Hide window: disable <Super>h
dconf write ${KEYS_GNOME_WM}/minimize "@as []"
# Open the application menu: disable <Super>m
dconf write ${KEYS_GNOME_SHELL}/open-application-menu "@as []"
# Switch to workspace left: disable <Super>Left
dconf write ${KEYS_GNOME_WM}/switch-to-workspace-left "@as []"
# Switch to workspace right: disable <Super>Right
dconf write ${KEYS_GNOME_WM}/switch-to-workspace-right "@as []"

# Super + direction keys, move window left and right monitors, or up and down workspaces
# Move window one monitor to the left
dconf write ${KEYS_GNOME_WM}/move-to-monitor-left "['<Shift><Super>Left','<Shift><Super>${left}']"
# Move window one workspace down
dconf write ${KEYS_GNOME_WM}/move-to-workspace-down "['<Shift><Super>Down','<Shift><Super>${down}']"
# Move window one workspace up
dconf write ${KEYS_GNOME_WM}/move-to-workspace-up "['<Shift><Super>Up','<Shift><Super>${up}']"
# Move window one monitor to the right
dconf write ${KEYS_GNOME_WM}/move-to-monitor-right "['<Shift><Super>Right','<Shift><Super>${right}']"

# Super + Ctrl + direction keys, change workspaces, move focus between monitors
# Move to workspace below
dconf write ${KEYS_GNOME_WM}/switch-to-workspace-down "['<Primary><Super>Down','<Primary><Super>${down}']"
# Move to workspace above
dconf write ${KEYS_GNOME_WM}/switch-to-workspace-up "['<Primary><Super>Up','<Primary><Super>${up}']"

# Toggle maximization state
dconf write ${KEYS_GNOME_WM}/toggle-maximized "['<Super>m']"
# Lock screen
dconf write ${KEYS_MEDIA}/screensaver "['<Super>Escape']"
# Home folder
dconf write ${KEYS_MEDIA}/home "['<Super>f']"
# Launch email client
dconf write ${KEYS_MEDIA}/email "['<Super>e']"
# Launch web browser
dconf write ${KEYS_MEDIA}/www "['<Super>b']"

# Close Window
dconf write ${KEYS_GNOME_WM}/close "['<Super>q']"

# Enable extension
gnome-extensions enable "pop-shell@system76.com"

echo "Restart shell!"
if [ -n "$(which xdotool)" ]
then
    xdotool key alt+F2
    sleep 0.5
    xdotool key r Return
fi

journalctl -o cat -n 0 -f "$(which gnome-shell)"
